import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import {
  ChannelType,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
} from '../../../../generated/prisma/client';
import {
  ChannelProvider,
  SendTextParams,
  SendMediaParams,
  SendResult,
  ParsedInboundMessage,
} from '../provider.interface';

const DEFAULT_DISPLAY_NAME = 'laptopguru.pl';

function formatSmtpFrom(config: Record<string, string>): string {
  const displayName = config['smtp_display_name'] || DEFAULT_DISPLAY_NAME;
  const address = config['smtp_from'] ?? config['smtp_user'];
  return `"${displayName}" <${address}>`;
}

@Injectable()
export class EmailProviderService implements ChannelProvider {
  private readonly logger = new Logger(EmailProviderService.name);
  readonly channelType = ChannelType.EMAIL;

  async sendTextMessage(params: SendTextParams): Promise<SendResult> {
    const config = params.metadata ?? {};
    const transporter = this.createTransporter(config);

    try {
      const info = await transporter.sendMail({
        from: formatSmtpFrom(config),
        to: params.recipientId,
        subject: config['subject'] ?? 'New message',
        text: params.text,
        html: `<div style="font-family: sans-serif;">${params.text.replace(/\n/g, '<br/>')}</div>`,
        ...(params.replyToExternalId
          ? {
              inReplyTo: params.replyToExternalId,
              references: params.replyToExternalId,
            }
          : {}),
      });

      return {
        success: true,
        externalId: info.messageId,
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: { messageId: info.messageId, response: info.response },
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      transporter.close();
    }
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    const config = params.metadata ?? {};
    const transporter = this.createTransporter(config);

    try {
      const info = await transporter.sendMail({
        from: formatSmtpFrom(config),
        to: params.recipientId,
        subject: config['subject'] ?? 'New message',
        text: params.caption ?? '',
        html: params.caption
          ? `<div style="font-family: sans-serif;">${params.caption.replace(/\n/g, '<br/>')}</div>`
          : undefined,
        attachments: [
          {
            filename: params.fileName ?? 'attachment',
            path: params.mediaUrl,
            contentType: params.mimeType,
          },
        ],
        ...(params.replyToExternalId
          ? {
              inReplyTo: params.replyToExternalId,
              references: params.replyToExternalId,
            }
          : {}),
      });

      return {
        success: true,
        externalId: info.messageId,
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: { messageId: info.messageId, response: info.response },
      };
    } catch (error) {
      this.logger.error(`Failed to send email with attachment: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      transporter.close();
    }
  }

  async parseInboundEvent(rawPayload: string): Promise<ParsedInboundMessage> {
    const parsed = await simpleParser(rawPayload);

    const senderAddress =
      parsed.from?.value?.[0]?.address ?? 'unknown@unknown.com';
    const senderName = parsed.from?.value?.[0]?.name ?? senderAddress;

    let contentType: MessageContentType = MessageContentType.TEXT;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let mediaFileName: string | undefined;

    if (parsed.attachments && parsed.attachments.length > 0) {
      const firstAttachment = parsed.attachments[0];
      contentType = MessageContentType.FILE;
      mediaMimeType = firstAttachment.contentType;
      mediaFileName = firstAttachment.filename;

      if (firstAttachment.contentType?.startsWith('image/')) {
        contentType = MessageContentType.IMAGE;
      } else if (firstAttachment.contentType?.startsWith('video/')) {
        contentType = MessageContentType.VIDEO;
      }
    }

    return {
      externalId: parsed.messageId ?? `email-${Date.now()}`,
      senderIdentifier: senderAddress,
      senderDisplayName: senderName,
      conversationExternalId: parsed.references
        ? Array.isArray(parsed.references)
          ? parsed.references[0]
          : parsed.references
        : parsed.messageId ?? undefined,
      direction: MessageDirection.INBOUND,
      contentType,
      body: (parsed.text || parsed.html || undefined) as string | undefined,
      mediaUrl,
      mediaMimeType,
      mediaFileName,
      timestamp: parsed.date ?? new Date(),
      rawPayload: {
        messageId: parsed.messageId,
        from: parsed.from?.text,
        to: parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text)
            : parsed.to.text
          : undefined,
        subject: parsed.subject,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        attachmentCount: parsed.attachments?.length ?? 0,
      },
    };
  }

  async validateConfig(config: Map<string, string>): Promise<boolean> {
    const requiredKeys = [
      'imap_host',
      'imap_port',
      'imap_user',
      'imap_password',
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_password',
      'smtp_from',
    ];
    return requiredKeys.every((key) => config.has(key) && config.get(key) !== '');
  }

  async testConnection(config: Map<string, string>): Promise<boolean> {
    let imapOk = false;
    let smtpOk = false;

    // Test IMAP
    try {
      const client = new ImapFlow({
        host: config.get('imap_host')!,
        port: parseInt(config.get('imap_port')!, 10),
        secure: true,
        auth: {
          user: config.get('imap_user')!,
          pass: config.get('imap_password')!,
        },
        logger: false as never,
      });
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (error) {
      this.logger.error(`IMAP connection test failed: ${error}`);
    }

    // Test SMTP
    try {
      const transporter = nodemailer.createTransport({
        host: config.get('smtp_host')!,
        port: parseInt(config.get('smtp_port')!, 10),
        secure: parseInt(config.get('smtp_port')!, 10) === 465,
        auth: {
          user: config.get('smtp_user')!,
          pass: config.get('smtp_password')!,
        },
      });
      await transporter.verify();
      transporter.close();
      smtpOk = true;
    } catch (error) {
      this.logger.error(`SMTP connection test failed: ${error}`);
    }

    return imapOk && smtpOk;
  }

  supportsTypingIndicator(): boolean {
    return false;
  }

  supportsReadReceipts(): boolean {
    return false;
  }

  private createTransporter(
    config: Record<string, string>,
  ): nodemailer.Transporter {
    const port = parseInt(config['smtp_port'] ?? '587', 10);
    return nodemailer.createTransport({
      host: config['smtp_host'],
      port,
      secure: port === 465,
      auth: {
        user: config['smtp_user'],
        pass: config['smtp_password'],
      },
    });
  }
}
