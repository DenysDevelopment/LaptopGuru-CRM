import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationType } from '../../../generated/prisma/client';
import { NotificationsGateway } from './notifications.gateway';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly cls: ClsService,
  ) {}

  async emitNewMessage(conversationId: string, messageId: string) {
    // Load the message with relations for the event payload
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        contact: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: true,
        geolocation: true,
      },
    });

    if (!message) {
      this.logger.warn(`Message ${messageId} not found for notification`);
      return;
    }

    // Emit to conversation room
    this.gateway.emitNewMessage(conversationId, {
      messageId: message.id,
      conversationId,
      direction: message.direction,
      contentType: message.contentType,
      body: message.body,
      externalId: message.externalId,
      contact: message.contact,
      attachments: message.attachments,
      geolocation: message.geolocation,
      createdAt: message.createdAt.toISOString(),
    });

    // Notify assigned agents
    const assignments = await this.prisma.conversationAssignment.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
    });

    for (const assignment of assignments) {
      await this.createAndEmitNotification({
        userId: assignment.userId,
        type: NotificationType.NEW_MESSAGE,
        title: 'New message',
        body: message.body
          ? message.body.substring(0, 100)
          : `[${message.contentType}]`,
        conversationId,
        messageId,
      });
    }
  }

  async emitConversationUpdate(
    conversationId: string,
    updateData: Record<string, unknown>,
  ) {
    this.gateway.emitConversationUpdate(conversationId, {
      conversationId,
      ...updateData,
    });
  }

  /**
   * Pushes a single ConversationEvent (status change, landing-sent, etc.) to
   * the conversation room so the timeline can refresh without a full reload.
   */
  async emitConversationEvent(
    conversationId: string,
    event: Record<string, unknown>,
  ) {
    this.gateway.emitConversationEvent(conversationId, {
      conversationId,
      ...event,
    });
  }

  async notifyAssignment(
    conversationId: string,
    userId: string,
    assignedByName?: string,
  ) {
    await this.createAndEmitNotification({
      userId,
      type: NotificationType.ASSIGNMENT,
      title: 'New assignment',
      body: assignedByName
        ? `${assignedByName} assigned you a conversation`
        : 'You have been assigned a conversation',
      conversationId,
    });
  }

  async notifySlaBreach(conversationId: string) {
    const assignments = await this.prisma.conversationAssignment.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
    });

    for (const assignment of assignments) {
      await this.createAndEmitNotification({
        userId: assignment.userId,
        type: NotificationType.SLA_BREACH,
        title: 'SLA breach',
        body: 'A conversation has breached its SLA deadline',
        conversationId,
      });
    }
  }

  private async createAndEmitNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    conversationId?: string;
    messageId?: string;
  }) {
    const companyId = this.cls.get<string>('companyId');
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        conversationId: params.conversationId,
        messageId: params.messageId,
        companyId,
      },
    });

    this.gateway.emitNotification(params.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    });

    this.logger.debug(
      `Notification ${notification.id} sent to user ${params.userId}`,
    );
  }
}
