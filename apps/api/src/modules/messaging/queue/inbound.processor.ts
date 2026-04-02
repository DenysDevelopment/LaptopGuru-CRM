import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import {
  ChannelType,
  ConversationStatus,
  MessageDirection,
  WebhookEventStatus,
} from '../../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const AVATARS_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');

export interface InboundJobData {
  webhookEventId: string;
  channelType: ChannelType;
}

@Processor('inbound-messages')
export class InboundProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<InboundJobData>): Promise<void> {
    const { webhookEventId, channelType } = job.data;

    this.logger.log(
      `Processing inbound webhook event ${webhookEventId} for ${channelType}`,
    );

    // Update attempt count
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { attempts: { increment: 1 } },
    });

    try {
      // Load the webhook event
      const webhookEvent = await this.prisma.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });

      if (!webhookEvent) {
        throw new Error(`Webhook event ${webhookEventId} not found`);
      }

      // Parse via provider
      const provider = this.providerRegistry.getOrThrow(channelType);
      const parsed = await provider.parseInboundEvent(webhookEvent.payload);

      // Find the active channel for this channel type
      const channel = await this.prisma.channel.findFirst({
        where: { type: channelType, isActive: true },
      });

      if (!channel) {
        throw new Error(`No active channel found for type ${channelType}`);
      }

      // Get bot token from channel config (needed for Telegram avatar fetching)
      const channelConfig = await this.prisma.channelConfig.findMany({
        where: { channelId: channel.id },
      });
      const botToken = channelConfig.find((c) => c.key === 'bot_token')?.value;

      // Find or create ContactChannel + Contact
      let contactChannel = await this.prisma.contactChannel.findFirst({
        where: {
          channelType,
          identifier: parsed.senderIdentifier,
          companyId: channel.companyId,
        },
      });

      if (!contactChannel) {
        // Create new contact and contact channel
        const contact = await this.prisma.contact.create({
          data: {
            displayName: parsed.senderDisplayName ?? parsed.senderIdentifier,
            firstName: parsed.senderFirstName ?? null,
            lastName: parsed.senderLastName ?? null,
            companyId: channel.companyId,
          },
        });

        contactChannel = await this.prisma.contactChannel.create({
          data: {
            contactId: contact.id,
            channelType,
            identifier: parsed.senderIdentifier,
            displayName: parsed.senderUsername
              ? `@${parsed.senderUsername}`
              : parsed.senderDisplayName,
            isPrimary: true,
            companyId: channel.companyId,
          },
        });

        this.logger.log(
          `Created new contact ${contact.id} for ${parsed.senderIdentifier}`,
        );

        // Fetch avatar for new Telegram contacts
        if (
          channelType === ChannelType.TELEGRAM &&
          botToken &&
          parsed.senderUserId
        ) {
          const avatarUrl = await this.fetchTelegramAvatar(
            botToken,
            parsed.senderUserId,
            contact.id,
          );
          if (avatarUrl) {
            await this.prisma.contact.update({
              where: { id: contact.id },
              data: { avatarUrl },
            });
            // contactChannel already set; no refresh needed
          }
        }
      } else {
        if (
          parsed.senderDisplayName &&
          parsed.senderDisplayName !== contactChannel.displayName
        ) {
          // Update display name if changed
          await this.prisma.contactChannel.update({
            where: { id: contactChannel.id },
            data: {
              displayName: parsed.senderUsername
                ? `@${parsed.senderUsername}`
                : parsed.senderDisplayName,
            },
          });
        }

        // Fetch avatar for existing Telegram contacts without one
        const existingContact = await this.prisma.contact.findUnique({
          where: { id: contactChannel.contactId },
        });
        if (
          channelType === ChannelType.TELEGRAM &&
          existingContact &&
          !existingContact.avatarUrl &&
          botToken &&
          parsed.senderUserId
        ) {
          const avatarUrl = await this.fetchTelegramAvatar(
            botToken,
            parsed.senderUserId,
            contactChannel.contactId,
          );
          if (avatarUrl) {
            await this.prisma.contact.update({
              where: { id: contactChannel.contactId },
              data: { avatarUrl },
            });
          }
        }
      }

      const contact = await this.prisma.contact.findUniqueOrThrow({ where: { id: contactChannel!.contactId } });

      // Find or create conversation
      let conversation = await this.findExistingConversation(
        contact.id,
        channel.id,
        parsed.conversationExternalId,
      );

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            contactId: contact.id,
            channelId: channel.id,
            status: ConversationStatus.NEW,
            externalId: parsed.conversationExternalId,
            lastMessageAt: parsed.timestamp,
            companyId: channel.companyId,
          },
        });
        this.logger.log(`Created new conversation ${conversation.id}`);
      }

      // Create the message
      const message = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: channel.id,
          direction: MessageDirection.INBOUND,
          contentType: parsed.contentType,
          body: parsed.body,
          externalId: parsed.externalId,
          contactId: contact.id,
          companyId: channel.companyId,
        },
      });

      // Create geolocation if present
      if (
        parsed.latitude !== undefined &&
        parsed.longitude !== undefined
      ) {
        await this.prisma.messageGeolocation.create({
          data: {
            messageId: message.id,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            address: parsed.locationAddress,
          },
        });
      }

      // Create attachment record if media present
      if (parsed.mediaUrl) {
        await this.prisma.messageAttachment.create({
          data: {
            messageId: message.id,
            fileName: parsed.mediaFileName ?? 'attachment',
            mimeType: parsed.mediaMimeType ?? 'application/octet-stream',
            fileSize: 0,
            storageKey: parsed.mediaUrl,
            storageUrl: parsed.mediaUrl,
          },
        });
      }

      // Update conversation
      const newStatus =
        conversation.status === ConversationStatus.NEW ||
        conversation.status === ConversationStatus.RESOLVED ||
        conversation.status === ConversationStatus.CLOSED
          ? ConversationStatus.OPEN
          : conversation.status;

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: parsed.timestamp,
          status: newStatus,
        },
      });

      // Mark webhook event as processed
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      // Emit real-time notification
      this.notificationsService.emitNewMessage(conversation.id, message.id);

      this.logger.log(
        `Inbound message ${message.id} processed for conversation ${conversation.id}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process inbound event ${webhookEventId}: ${errorMessage}`,
      );

      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookEventStatus.FAILED,
          error: errorMessage,
        },
      });

      throw error; // Re-throw for BullMQ retry
    }
  }

  /**
   * Fetch Telegram user profile photo and save locally.
   */
  private async fetchTelegramAvatar(
    botToken: string,
    userId: number,
    contactId: string,
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      );
      const data = (await res.json()) as {
        ok: boolean;
        result?: { photos?: Array<Array<{ file_id: string }>> };
      };
      if (!data.ok || !data.result?.photos?.length) return null;

      const photo = data.result.photos[0];
      // Get the largest size
      const fileInfo = photo[photo.length - 1];
      if (!fileInfo?.file_id) return null;

      const fileRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileInfo.file_id}`,
      );
      const fileData = (await fileRes.json()) as {
        ok: boolean;
        result?: { file_path?: string };
      };
      if (!fileData.ok || !fileData.result?.file_path) return null;

      const imageUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) return null;

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const ext = fileData.result.file_path.split('.').pop() || 'jpg';
      const fileName = `${contactId}.${ext}`;

      fs.mkdirSync(AVATARS_DIR, { recursive: true });
      fs.writeFileSync(path.join(AVATARS_DIR, fileName), buffer);

      this.logger.log(
        `Saved Telegram avatar for contact ${contactId}: ${fileName}`,
      );
      return `/uploads/avatars/${fileName}`;
    } catch (err) {
      this.logger.error(
        `Failed to fetch Telegram avatar for user ${userId}: ${err}`,
      );
      return null;
    }
  }

  private async findExistingConversation(
    contactId: string,
    channelId: string,
    conversationExternalId?: string,
  ) {
    // First try by external ID
    if (conversationExternalId) {
      const byExternalId = await this.prisma.conversation.findFirst({
        where: {
          channelId,
          externalId: conversationExternalId,
          status: { notIn: [ConversationStatus.CLOSED, ConversationStatus.SPAM] },
        },
      });
      if (byExternalId) return byExternalId;
    }

    // Fall back to most recent open conversation for this contact + channel
    return this.prisma.conversation.findFirst({
      where: {
        contactId,
        channelId,
        status: { notIn: [ConversationStatus.CLOSED, ConversationStatus.SPAM] },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }
}
