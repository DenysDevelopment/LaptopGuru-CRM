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

interface TelegramApiResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  description?: string;
  error_code?: number;
}

@Injectable()
export class TelegramProviderService implements ChannelProvider {
  private readonly logger = new Logger(TelegramProviderService.name);
  readonly channelType = ChannelType.TELEGRAM;

  private getBaseUrl(token: string): string {
    return `https://api.telegram.org/bot${token}`;
  }

  private async callApi(
    token: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<TelegramApiResponse> {
    const url = `${this.getBaseUrl(token)}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await response.json()) as TelegramApiResponse;
  }

  async sendTextMessage(params: SendTextParams): Promise<SendResult> {
    const token = params.metadata?.['bot_token'];
    if (!token) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing bot_token in metadata',
      };
    }

    try {
      const body: Record<string, unknown> = {
        chat_id: params.recipientId,
        text: params.text,
        parse_mode: 'HTML',
      };

      if (params.replyToExternalId) {
        body['reply_to_message_id'] = parseInt(params.replyToExternalId, 10);
      }

      const result = await this.callApi(token, 'sendMessage', body);

      if (!result.ok) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.description ?? 'Unknown Telegram error',
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      const messageResult = result.result as Record<string, unknown>;
      return {
        success: true,
        externalId: String(messageResult['message_id']),
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    const token = params.metadata?.['bot_token'];
    if (!token) {
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: 'Missing bot_token in metadata',
      };
    }

    try {
      const method = this.resolveMediaMethod(params.mimeType);
      const mediaField = this.resolveMediaField(params.mimeType);

      const body: Record<string, unknown> = {
        chat_id: params.recipientId,
        [mediaField]: params.mediaUrl,
      };

      if (params.caption) {
        body['caption'] = params.caption;
        body['parse_mode'] = 'HTML';
      }

      if (params.replyToExternalId) {
        body['reply_to_message_id'] = parseInt(params.replyToExternalId, 10);
      }

      const result = await this.callApi(token, method, body);

      if (!result.ok) {
        return {
          success: false,
          deliveryStatus: MessageDeliveryStatus.FAILED,
          error: result.description ?? 'Unknown Telegram error',
          rawResponse: result as unknown as Record<string, unknown>,
        };
      }

      const messageResult = result.result as Record<string, unknown>;
      return {
        success: true,
        externalId: String(messageResult['message_id']),
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`Failed to send Telegram media: ${error}`);
      return {
        success: false,
        deliveryStatus: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async parseInboundEvent(rawPayload: string): Promise<ParsedInboundMessage> {
    const update = JSON.parse(rawPayload);
    const message = update.message ?? update.edited_message ?? update.channel_post;

    if (!message) {
      throw new Error('No message found in Telegram update');
    }

    const chat = message.chat;
    const from = message.from;

    let contentType: MessageContentType = MessageContentType.TEXT;
    let body: string | undefined = message.text;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let mediaFileName: string | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;
    let locationAddress: string | undefined;

    if (message.photo) {
      contentType = MessageContentType.IMAGE;
      body = message.caption;
      const largestPhoto = message.photo[message.photo.length - 1];
      mediaUrl = largestPhoto.file_id;
      mediaMimeType = 'image/jpeg';
    } else if (message.document) {
      contentType = MessageContentType.FILE;
      body = message.caption;
      mediaUrl = message.document.file_id;
      mediaMimeType = message.document.mime_type;
      mediaFileName = message.document.file_name;
    } else if (message.video) {
      contentType = MessageContentType.VIDEO;
      body = message.caption;
      mediaUrl = message.video.file_id;
      mediaMimeType = message.video.mime_type ?? 'video/mp4';
      mediaFileName = message.video.file_name;
    } else if (message.voice) {
      contentType = MessageContentType.VOICE;
      mediaUrl = message.voice.file_id;
      mediaMimeType = message.voice.mime_type ?? 'audio/ogg';
    } else if (message.sticker) {
      contentType = MessageContentType.STICKER;
      mediaUrl = message.sticker.file_id;
      mediaMimeType = message.sticker.is_animated ? 'application/x-tgsticker' : 'image/webp';
    } else if (message.location) {
      contentType = MessageContentType.GEOLOCATION;
      latitude = message.location.latitude;
      longitude = message.location.longitude;
    } else if (message.contact) {
      contentType = MessageContentType.CONTACT_CARD;
      body = JSON.stringify({
        phone: message.contact.phone_number,
        firstName: message.contact.first_name,
        lastName: message.contact.last_name,
      });
    }

    const senderName = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ')
      : chat.title ?? 'Unknown';

    return {
      externalId: String(message.message_id),
      senderIdentifier: String(chat.id),
      senderDisplayName: senderName,
      senderFirstName: from?.first_name ?? undefined,
      senderLastName: from?.last_name ?? undefined,
      senderUsername: from?.username ?? undefined,
      senderUserId: from?.id ?? undefined,
      conversationExternalId: String(chat.id),
      direction: MessageDirection.INBOUND,
      contentType,
      body,
      mediaUrl,
      mediaMimeType,
      mediaFileName,
      latitude,
      longitude,
      locationAddress,
      timestamp: new Date(message.date * 1000),
      rawPayload: update,
    };
  }

  async validateConfig(config: Map<string, string>): Promise<boolean> {
    return config.has('bot_token') && config.get('bot_token') !== '';
  }

  async testConnection(config: Map<string, string>): Promise<boolean> {
    const token = config.get('bot_token');
    if (!token) return false;

    try {
      const response = await fetch(`${this.getBaseUrl(token)}/getMe`);
      const data = (await response.json()) as TelegramApiResponse;
      return data.ok === true;
    } catch (error) {
      this.logger.error(`Telegram connection test failed: ${error}`);
      return false;
    }
  }

  supportsTypingIndicator(): boolean {
    return true;
  }

  supportsReadReceipts(): boolean {
    return false;
  }

  async sendTypingIndicator(chatId: string, token: string): Promise<void> {
    await this.callApi(token, 'sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  }

  private resolveMediaMethod(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'sendPhoto';
    if (mimeType.startsWith('video/')) return 'sendVideo';
    if (mimeType.startsWith('audio/ogg') || mimeType === 'audio/opus') return 'sendVoice';
    if (mimeType.startsWith('audio/')) return 'sendAudio';
    return 'sendDocument';
  }

  private resolveMediaField(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'photo';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/ogg') || mimeType === 'audio/opus') return 'voice';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }
}
