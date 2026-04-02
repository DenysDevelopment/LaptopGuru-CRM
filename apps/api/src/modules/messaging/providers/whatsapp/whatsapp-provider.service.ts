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

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

@Injectable()
export class WhatsAppProviderService implements ChannelProvider {
  private readonly logger = new Logger(WhatsAppProviderService.name);
  private readonly graphApiBase = 'https://graph.facebook.com/v19.0';
  readonly channelType = ChannelType.WHATSAPP;

  private async callApi(
    phoneNumberId: string,
    accessToken: string,
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const url = `${this.graphApiBase}/${phoneNumberId}/${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as WhatsAppApiResponse;
  }

  async sendTextMessage(params: SendTextParams): Promise<SendResult> {
    const accessToken = params.metadata?.['access_token'];
    const phoneNumberId = params.metadata?.['phone_number_id'];
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing access_token or phone_number_id in metadata',
      };
    }

    try {
      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.recipientId,
        type: 'text',
        text: { body: params.text },
      };

      if (params.replyToExternalId) {
        body['context'] = { message_id: params.replyToExternalId };
      }

      const result = await this.callApi(phoneNumberId, accessToken, 'messages', body);

      if (result.error) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.error.message,
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      return {
        success: true,
        externalId: result.messages?.[0]?.id ?? '',
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    const accessToken = params.metadata?.['access_token'];
    const phoneNumberId = params.metadata?.['phone_number_id'];
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing access_token or phone_number_id in metadata',
      };
    }

    try {
      const mediaType = this.resolveMediaType(params.mimeType);
      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.recipientId,
        type: mediaType,
        [mediaType]: {
          link: params.mediaUrl,
          ...(params.caption ? { caption: params.caption } : {}),
          ...(params.fileName ? { filename: params.fileName } : {}),
        },
      };

      if (params.replyToExternalId) {
        body['context'] = { message_id: params.replyToExternalId };
      }

      const result = await this.callApi(phoneNumberId, accessToken, 'messages', body);

      if (result.error) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.error.message,
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      return {
        success: true,
        externalId: result.messages?.[0]?.id ?? '',
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp media: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async parseInboundEvent(rawPayload: string): Promise<ParsedInboundMessage> {
    const payload = JSON.parse(rawPayload);
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.[0]) {
      throw new Error('No message found in WhatsApp webhook payload');
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    let contentType: MessageContentType = MessageContentType.TEXT;
    let body: string | undefined;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let mediaFileName: string | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;
    let locationAddress: string | undefined;

    switch (message.type) {
      case 'text':
        contentType = MessageContentType.TEXT;
        body = message.text?.body;
        break;
      case 'image':
        contentType = MessageContentType.IMAGE;
        mediaUrl = message.image?.id;
        mediaMimeType = message.image?.mime_type;
        body = message.image?.caption;
        break;
      case 'document':
        contentType = MessageContentType.FILE;
        mediaUrl = message.document?.id;
        mediaMimeType = message.document?.mime_type;
        mediaFileName = message.document?.filename;
        body = message.document?.caption;
        break;
      case 'video':
        contentType = MessageContentType.VIDEO;
        mediaUrl = message.video?.id;
        mediaMimeType = message.video?.mime_type;
        body = message.video?.caption;
        break;
      case 'audio':
        contentType = MessageContentType.VOICE;
        mediaUrl = message.audio?.id;
        mediaMimeType = message.audio?.mime_type;
        break;
      case 'sticker':
        contentType = MessageContentType.STICKER;
        mediaUrl = message.sticker?.id;
        mediaMimeType = message.sticker?.mime_type;
        break;
      case 'location':
        contentType = MessageContentType.GEOLOCATION;
        latitude = message.location?.latitude;
        longitude = message.location?.longitude;
        locationAddress = message.location?.name ?? message.location?.address;
        break;
      case 'contacts':
        contentType = MessageContentType.CONTACT_CARD;
        body = JSON.stringify(message.contacts);
        break;
      default:
        contentType = MessageContentType.TEXT;
        body = `[Unsupported message type: ${message.type}]`;
    }

    return {
      externalId: message.id,
      senderIdentifier: message.from,
      senderDisplayName: contact?.profile?.name ?? message.from,
      conversationExternalId: message.from,
      direction: MessageDirection.INBOUND,
      contentType,
      body,
      mediaUrl,
      mediaMimeType,
      mediaFileName,
      latitude,
      longitude,
      locationAddress,
      timestamp: new Date(parseInt(message.timestamp, 10) * 1000),
      rawPayload: payload,
    };
  }

  async validateConfig(config: Map<string, string>): Promise<boolean> {
    const requiredKeys = ['access_token', 'phone_number_id', 'webhook_verify_token'];
    return requiredKeys.every((key) => config.has(key) && config.get(key) !== '');
  }

  async testConnection(config: Map<string, string>): Promise<boolean> {
    const accessToken = config.get('access_token');
    const phoneNumberId = config.get('phone_number_id');
    if (!accessToken || !phoneNumberId) return false;

    try {
      const url = `${this.graphApiBase}/${phoneNumberId}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json()) as Record<string, unknown>;
      return !data['error'];
    } catch (error) {
      this.logger.error(`WhatsApp connection test failed: ${error}`);
      return false;
    }
  }

  supportsTypingIndicator(): boolean {
    return false;
  }

  supportsReadReceipts(): boolean {
    return true;
  }

  async markAsRead(
    messageId: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<void> {
    await this.callApi(phoneNumberId, accessToken, 'messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  private resolveMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'image/webp') return 'sticker';
    return 'document';
  }
}
