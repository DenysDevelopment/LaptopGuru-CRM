import { Injectable, Logger } from '@nestjs/common';
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

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
}

@Injectable()
export class SmsProviderService implements ChannelProvider {
  private readonly logger = new Logger(SmsProviderService.name);
  readonly channelType = ChannelType.SMS;

  private getBasicAuth(accountSid: string, authToken: string): string {
    return Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  }

  async sendTextMessage(params: SendTextParams): Promise<SendResult> {
    const accountSid = params.metadata?.['account_sid'];
    const authToken = params.metadata?.['auth_token'];
    const fromNumber = params.metadata?.['phone_number'];

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing account_sid, auth_token, or phone_number in metadata',
      };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: params.recipientId,
        From: fromNumber,
        Body: params.text,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.getBasicAuth(accountSid, authToken)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const result = (await response.json()) as TwilioMessageResponse;

      if (result.error_code) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.error_message ?? `Twilio error ${result.error_code}`,
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      return {
        success: true,
        externalId: result.sid ?? '',
        deliveryStatus: this.mapTwilioStatus(result.status),
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    const accountSid = params.metadata?.['account_sid'];
    const authToken = params.metadata?.['auth_token'];
    const fromNumber = params.metadata?.['phone_number'];

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing account_sid, auth_token, or phone_number in metadata',
      };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: params.recipientId,
        From: fromNumber,
        MediaUrl: params.mediaUrl,
      });

      if (params.caption) {
        body.append('Body', params.caption);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.getBasicAuth(accountSid, authToken)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const result = (await response.json()) as TwilioMessageResponse;

      if (result.error_code) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.error_message ?? `Twilio error ${result.error_code}`,
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      return {
        success: true,
        externalId: result.sid ?? '',
        deliveryStatus: this.mapTwilioStatus(result.status),
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send MMS: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async parseInboundEvent(rawPayload: string): Promise<ParsedInboundMessage> {
    const params = new URLSearchParams(rawPayload);
    const data = Object.fromEntries(params.entries());

    const numMedia = parseInt(data['NumMedia'] ?? '0', 10);
    let contentType: MessageContentType = MessageContentType.TEXT;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    if (numMedia > 0) {
      mediaUrl = data['MediaUrl0'];
      mediaMimeType = data['MediaContentType0'];
      contentType = mediaMimeType?.startsWith('image/')
        ? MessageContentType.IMAGE
        : mediaMimeType?.startsWith('video/')
          ? MessageContentType.VIDEO
          : MessageContentType.FILE;
    }

    return {
      externalId: data['MessageSid'] ?? `sms-${Date.now()}`,
      senderIdentifier: data['From'] ?? '',
      senderDisplayName: data['From'] ?? 'Unknown',
      conversationExternalId: `${data['From']}-${data['To']}`,
      direction: MessageDirection.INBOUND,
      contentType,
      body: data['Body'] ?? undefined,
      mediaUrl,
      mediaMimeType,
      timestamp: new Date(),
      rawPayload: data as unknown as Record<string, unknown>,
    };
  }

  async validateConfig(config: Map<string, string>): Promise<boolean> {
    const requiredKeys = ['account_sid', 'auth_token', 'phone_number'];
    return requiredKeys.every((key) => config.has(key) && config.get(key) !== '');
  }

  async testConnection(config: Map<string, string>): Promise<boolean> {
    const accountSid = config.get('account_sid');
    const authToken = config.get('auth_token');
    if (!accountSid || !authToken) return false;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${this.getBasicAuth(accountSid, authToken)}`,
        },
      });
      return response.ok;
    } catch (error) {
      this.logger.error(`Twilio connection test failed: ${error}`);
      return false;
    }
  }

  supportsTypingIndicator(): boolean {
    return false;
  }

  supportsReadReceipts(): boolean {
    return false;
  }

  private mapTwilioStatus(status?: string): MessageDeliveryStatus {
    switch (status) {
      case 'queued':
        return MessageDeliveryStatus.QUEUED;
      case 'sending':
        return MessageDeliveryStatus.SENDING;
      case 'sent':
        return MessageDeliveryStatus.SENT;
      case 'delivered':
        return MessageDeliveryStatus.DELIVERED;
      case 'read':
        return MessageDeliveryStatus.READ;
      case 'failed':
      case 'undelivered':
        return MessageDeliveryStatus.FAILED;
      default:
        return MessageDeliveryStatus.QUEUED;
    }
  }
}
