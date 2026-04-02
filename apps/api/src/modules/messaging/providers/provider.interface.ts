import {
  ChannelType,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
} from '../../../generated/prisma/client';

export interface SendTextParams {
  channelType: ChannelType;
  recipientId: string;
  text: string;
  conversationExternalId?: string;
  replyToExternalId?: string;
  metadata?: Record<string, string>;
}

export interface SendMediaParams {
  channelType: ChannelType;
  recipientId: string;
  mediaUrl: string;
  mimeType: string;
  fileName?: string;
  caption?: string;
  conversationExternalId?: string;
  replyToExternalId?: string;
  metadata?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  externalId?: string;
  deliveryStatus: MessageDeliveryStatus;
  error?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ParsedInboundMessage {
  externalId: string;
  senderIdentifier: string;
  senderDisplayName?: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderUsername?: string;
  /** Platform-specific numeric user ID (e.g. Telegram user ID for avatar fetching) */
  senderUserId?: number;
  conversationExternalId?: string;
  direction: MessageDirection;
  contentType: MessageContentType;
  body?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
  timestamp: Date;
  rawPayload: Record<string, unknown>;
}

export interface ChannelProvider {
  readonly channelType: ChannelType;

  sendTextMessage(params: SendTextParams): Promise<SendResult>;

  sendMediaMessage(params: SendMediaParams): Promise<SendResult>;

  parseInboundEvent(rawPayload: string): Promise<ParsedInboundMessage>;

  validateConfig(config: Map<string, string>): Promise<boolean>;

  testConnection(config: Map<string, string>): Promise<boolean>;

  supportsTypingIndicator(): boolean;

  supportsReadReceipts(): boolean;
}
