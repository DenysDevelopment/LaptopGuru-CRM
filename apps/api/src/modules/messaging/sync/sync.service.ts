import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { parseEmail } from './email-parser.util';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENTS_PER_EMAIL = 10;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Sync emails from IMAP for ALL active EMAIL channels.
   * Returns total number of newly imported messages.
   */
  async syncAllEmailChannels(): Promise<number> {
    const channels = await this.prisma.channel.findMany({
      where: { type: 'EMAIL', isActive: true },
      include: { config: true },
    });

    if (channels.length === 0) {
      this.logger.warn('No active EMAIL channels found');
      return 0;
    }

    let totalImported = 0;

    for (const channel of channels) {
      const imported = await this.syncSingleChannel(channel);
      totalImported += imported;
    }

    this.logger.log(`Email sync complete: ${totalImported} messages imported`);
    return totalImported;
  }

  private async syncSingleChannel(
    channel: Awaited<
      ReturnType<
        typeof this.prisma.channel.findFirst<{ include: { config: true } }>
      >
    > & { config: { key: string; value: string }[] },
  ): Promise<number> {
    const config = Object.fromEntries(
      channel.config.map((c) => [c.key, c.value]),
    );

    const imapHost = config.imap_host || config.imapHost;
    const imapPort = config.imap_port || config.imapPort || '993';
    const imapUser = config.imap_user || config.username || config.imapUser;
    const imapPass =
      config.imap_password || config.password || config.imapPassword;

    if (!imapHost || !imapUser || !imapPass) {
      this.logger.warn(
        `IMAP config incomplete for channel "${channel.name}" (${channel.id})`,
      );
      return 0;
    }

    const client = new ImapFlow({
      host: imapHost,
      port: Number(imapPort),
      secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    let imported = 0;

    try {
      await client.connect();
      this.logger.log(
        `Connected to ${imapUser} (channel: ${channel.name})`,
      );
      const lock = await client.getMailboxLock('INBOX');

      try {
        const mailboxStatus = client.mailbox;
        if (!mailboxStatus || mailboxStatus.exists === 0) {
          this.logger.warn(`Mailbox empty for ${imapUser}`);
          return 0;
        }

        const messages = client.fetch('1:*', {
          envelope: true,
          source: true,
          uid: true,
        });

        for await (const msg of messages) {
          const messageId = msg.envelope?.messageId;
          if (!messageId) continue;

          // Skip already-imported messages
          const existing = await this.prisma.message.findFirst({
            where: { externalId: messageId },
          });
          if (existing) continue;

          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);

          const senderEmail = parsed.from?.value?.[0]?.address;
          const senderName =
            parsed.from?.value?.[0]?.name || senderEmail || 'Unknown';
          const subject = parsed.subject || '';
          const body = parsed.text || parsed.html || '';

          if (!senderEmail) continue;

          const leadData = parseEmail(body, subject);
          const actualEmail = leadData.customerEmail || senderEmail;
          const actualName = leadData.customerName || senderName;

          // Find or create contact
          let contactChannel = await this.prisma.contactChannel.findFirst({
            where: {
              channelType: 'EMAIL',
              identifier: actualEmail,
              companyId: channel.companyId,
            },
          });

          if (!contactChannel) {
            await this.prisma.contact.create({
              data: {
                displayName: actualName,
                firstName: actualName.split(' ')[0] || null,
                lastName: actualName.split(' ').slice(1).join(' ') || null,
                companyId: channel.companyId,
                channels: {
                  create: {
                    channelType: 'EMAIL',
                    identifier: actualEmail,
                    displayName: actualName,
                    companyId: channel.companyId,
                  },
                },
                ...(leadData.category === 'lead'
                  ? {
                      customFields: {
                        create: [
                          ...(leadData.productName
                            ? [
                                {
                                  fieldName: 'productName',
                                  fieldValue: leadData.productName,
                                },
                              ]
                            : []),
                          ...(leadData.productUrl
                            ? [
                                {
                                  fieldName: 'productUrl',
                                  fieldValue: leadData.productUrl,
                                },
                              ]
                            : []),
                          ...(leadData.customerPhone
                            ? [
                                {
                                  fieldName: 'phone',
                                  fieldValue: leadData.customerPhone,
                                },
                              ]
                            : []),
                        ],
                      },
                    }
                  : {}),
              },
            });

            contactChannel = await this.prisma.contactChannel.findFirst({
              where: {
                channelType: 'EMAIL',
                identifier: actualEmail,
                companyId: channel.companyId,
              },
            });
            if (!contactChannel) continue;
          }

          const contact = await this.prisma.contact.findUniqueOrThrow({ where: { id: contactChannel.contactId } });

          // Thread lookup
          const threadId = parsed.references
            ? Array.isArray(parsed.references)
              ? parsed.references[0]
              : parsed.references
            : null;

          let conversation = threadId
            ? await this.prisma.conversation.findFirst({
                where: {
                  contactId: contact.id,
                  channelId: channel.id,
                  externalId: threadId,
                },
              })
            : null;

          if (!conversation) {
            conversation = await this.prisma.conversation.findFirst({
              where: {
                contactId: contact.id,
                channelId: channel.id,
                status: { notIn: ['CLOSED', 'SPAM'] },
              },
              orderBy: { createdAt: 'desc' },
            });
          }

          const isNew = !conversation;

          if (!conversation) {
            conversation = await this.prisma.conversation.create({
              data: {
                contactId: contact.id,
                channelId: channel.id,
                subject,
                status: 'NEW',
                priority: 'NORMAL',
                externalId: threadId || messageId,
                companyId: channel.companyId,
              },
            });
          }

          const hasAttachments =
            parsed.attachments && parsed.attachments.length > 0;

          const message = await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              channelId: channel.id,
              direction: 'INBOUND',
              contentType: hasAttachments ? 'FILE' : 'TEXT',
              body: body.slice(0, 10000),
              externalId: messageId,
              contactId: contact.id,
              companyId: channel.companyId,
            },
          });

          // Save attachments
          if (parsed.attachments && parsed.attachments.length > 0) {
            const attachments = parsed.attachments.slice(
              0,
              MAX_ATTACHMENTS_PER_EMAIL,
            );
            const attachDir = path.join(UPLOADS_DIR, channel.id, message.id);
            fs.mkdirSync(attachDir, { recursive: true });

            for (const att of attachments) {
              if (!att.content || att.size > MAX_ATTACHMENT_SIZE) continue;
              const fileName = att.filename || `attachment-${Date.now()}`;
              const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
              const filePath = path.join(attachDir, safeName);

              try {
                fs.writeFileSync(filePath, att.content);
                const storageKey = `uploads/${channel.id}/${message.id}/${safeName}`;
                const storageUrl = `/${storageKey}`;

                await this.prisma.messageAttachment.create({
                  data: {
                    messageId: message.id,
                    fileName: att.filename || safeName,
                    mimeType: att.contentType || 'application/octet-stream',
                    fileSize: att.size || att.content.length,
                    storageKey,
                    storageUrl,
                  },
                });
                this.logger.debug(
                  `Saved attachment: ${fileName} (${att.size} bytes)`,
                );
              } catch (attErr) {
                this.logger.error(
                  `Failed to save attachment ${fileName}`,
                  attErr instanceof Error ? attErr.stack : String(attErr),
                );
              }
            }
          }

          await this.prisma.messageStatusEvent.create({
            data: { messageId: message.id, status: 'DELIVERED' },
          });

          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: parsed.date || new Date(),
              status:
                conversation.status === 'WAITING_REPLY' ? 'OPEN' : undefined,
            },
          });

          // Emit real-time notification
          try {
            if (isNew) {
              await this.notifications.emitConversationUpdate(
                conversation.id,
                {
                  type: 'new_conversation',
                  body: subject || body.slice(0, 100),
                  senderName,
                  channelType: 'EMAIL',
                },
              );
            }
            await this.notifications.emitNewMessage(
              conversation.id,
              message.id,
            );
          } catch {
            // Notification failure should not break sync
          }

          imported++;
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error syncing ${imapUser}: ${errMsg}`);
    } finally {
      await client.logout().catch(() => {});
    }

    this.logger.log(`Imported ${imported} emails from ${imapUser}`);
    return imported;
  }
}
