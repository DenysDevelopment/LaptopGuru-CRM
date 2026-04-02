import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { ClsService } from 'nestjs-cls';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findByConversation(conversationId: string, query: ListMessagesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        senderUser: { select: { id: true, name: true, email: true } },
        contact: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            storageUrl: true,
          },
        },
        statuses: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { status: true, timestamp: true },
        },
      },
    });

    const items = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      contentType: m.contentType,
      body: m.body,
      createdAt: m.createdAt,
      sender: m.senderUser
        ? {
            id: m.senderUser.id,
            name: m.senderUser.name,
            email: m.senderUser.email,
          }
        : null,
      contact: m.contact
        ? {
            id: m.contact.id,
            name: m.contact.displayName,
            avatarUrl: m.contact.avatarUrl,
          }
        : null,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        url: a.storageUrl,
        size: a.fileSize,
      })),
      status: m.statuses[0]?.status || null,
    }));

    return { items };
  }

  async sendMessage(
    conversationId: string,
    dto: SendMessageDto,
    senderId: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, channelId: true, contactId: true },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (!dto.body?.trim()) {
      throw new BadRequestException('Message body is required');
    }

    // Create the message record
    const companyId = this.cls.get<string>('companyId');
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: 'OUTBOUND',
        contentType: dto.contentType ?? 'TEXT',
        body: dto.body,
        senderId,
        contactId: conversation.contactId,
        companyId,
      },
    });

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        status: 'WAITING_REPLY',
      },
    });

    // Send message through the actual channel
    const channel = await this.prisma.channel.findUnique({
      where: { id: conversation.channelId },
      include: { config: true },
    });

    if (channel) {
      const configMap = Object.fromEntries(
        channel.config.map((c) => [c.key, c.value]),
      );

      let deliveryStatus: 'SENT' | 'FAILED' = 'FAILED';
      let externalId: string | undefined;

      try {
        if (channel.type === 'TELEGRAM' && configMap.bot_token) {
          const contactChannel = await this.prisma.contactChannel.findFirst({
            where: {
              contactId: conversation.contactId,
              channelType: 'TELEGRAM',
            },
          });
          if (contactChannel) {
            const res = await fetch(
              `https://api.telegram.org/bot${configMap.bot_token}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: contactChannel.identifier,
                  text: dto.body,
                }),
              },
            );
            const result = (await res.json()) as {
              ok: boolean;
              result?: { message_id: number };
            };
            if (result.ok) {
              deliveryStatus = 'SENT';
              externalId = String(result.result!.message_id);
            } else {
              this.logger.error(`[TG Send] Error: ${JSON.stringify(result)}`);
            }
          }
        }

        if (channel.type === 'EMAIL') {
          const contactChannel = await this.prisma.contactChannel.findFirst({
            where: {
              contactId: conversation.contactId,
              channelType: 'EMAIL',
            },
          });
          if (contactChannel) {
            const smtpHost =
              configMap.smtp_host || configMap.smtpHost;
            const smtpPort = Number(
              configMap.smtp_port || configMap.smtpPort || '465',
            );
            const smtpUser =
              configMap.smtp_user || configMap.username;
            const smtpPass =
              configMap.smtp_password || configMap.password;
            const smtpFrom = configMap.smtp_from || smtpUser;

            const transporter = nodemailer.createTransport({
              host: smtpHost,
              port: smtpPort,
              secure: smtpPort === 465,
              auth: { user: smtpUser, pass: smtpPass },
            });

            // Get conversation subject for reply threading
            const conv = await this.prisma.conversation.findUnique({
              where: { id: conversationId },
              select: { subject: true, externalId: true },
            });

            const info = await transporter.sendMail({
              from: smtpFrom,
              to: contactChannel.identifier,
              subject: conv?.subject
                ? `Re: ${conv.subject}`
                : 'New message',
              text: dto.body,
              html: `<div style="font-family:sans-serif;">${escapeHtml(dto.body).replace(/\n/g, '<br/>')}</div>`,
              ...(conv?.externalId
                ? {
                    inReplyTo: conv.externalId,
                    references: conv.externalId,
                  }
                : {}),
            });

            transporter.close();
            deliveryStatus = 'SENT';
            externalId = info.messageId;
          }
        }
      } catch (err) {
        this.logger.error(`[Send] Error: ${err}`);
      }

      // Update message with external ID
      await this.prisma.message.update({
        where: { id: message.id },
        data: { externalId },
      });

      // Create status event
      await this.prisma.messageStatusEvent.create({
        data: {
          messageId: message.id,
          status: deliveryStatus,
        },
      });
    }

    return message;
  }
}
