import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ConversationStatus,
  ConversationEventType,
  Prisma,
} from '../../../generated/prisma/client';

/**
 * 4-hour window after a manual close during which an inbound message will NOT
 * automatically reopen the conversation. Stops the loop "admin closes →
 * client immediately replies → reopens → admin closes" when a difficult
 * client keeps writing.
 */
const MANUAL_CLOSE_GRACE_MS = 4 * 60 * 60 * 1000;

interface TransitionOptions {
  conversationId: string;
  toStatus: ConversationStatus;
  /** null = system / cron / inbound webhook trigger. */
  actorUserId: string | null;
  /** Optional human-readable reason recorded on the event payload. */
  reason?: string;
  /**
   * If provided, the UPDATE is conditional on the current status matching
   * any of these values. Used for auto-transitions (e.g. only NEW → OPEN
   * when current is still NEW). Omit to force the transition (used by
   * manual override from the UI).
   */
  requireFromStatus?: ConversationStatus[];
  /**
   * When true and the current status is RESOLVED with a manual closer set
   * within the grace window, the transition is suppressed (loop protection
   * for inbound-driven reopens). Pass `false` for explicit admin actions.
   */
  respectManualCloseGrace?: boolean;
}

/**
 * Single chokepoint for every conversation status change. Performs a
 * conditional UPDATE so concurrent triggers race-safely no-op, and writes
 * a `STATUS_CHANGED` ConversationEvent + real-time push on success.
 */
@Injectable()
export class ConversationStatusService {
  private readonly logger = new Logger(ConversationStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async transition(opts: TransitionOptions): Promise<boolean> {
    const {
      conversationId,
      toStatus,
      actorUserId,
      reason,
      requireFromStatus,
      respectManualCloseGrace = false,
    } = opts;

    const current = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        status: true,
        companyId: true,
        lastStatusChangedById: true,
        lastStatusChangedAt: true,
      },
    });
    if (!current) return false;
    if (current.status === toStatus) return false;
    if (requireFromStatus && !requireFromStatus.includes(current.status)) {
      return false;
    }
    if (
      respectManualCloseGrace &&
      current.status === ConversationStatus.RESOLVED &&
      current.lastStatusChangedById !== null &&
      current.lastStatusChangedAt &&
      Date.now() - current.lastStatusChangedAt.getTime() < MANUAL_CLOSE_GRACE_MS
    ) {
      this.logger.debug(
        `Skipping reopen of conversation ${conversationId}: manual close in grace window`,
      );
      return false;
    }

    const fromStatus = current.status;
    const now = new Date();

    // Conditional UPDATE: race-safe — if another worker has already moved
    // the status, the WHERE clause excludes us and updateMany returns 0.
    const updateResult = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        ...(requireFromStatus
          ? { status: { in: requireFromStatus } }
          : { status: fromStatus }),
      },
      data: {
        status: toStatus,
        lastStatusChangedById: actorUserId,
        lastStatusChangedAt: now,
        ...(toStatus === ConversationStatus.RESOLVED ? { closedAt: now } : {}),
      },
    });
    if (updateResult.count === 0) return false;

    const event = await this.prisma.conversationEvent.create({
      data: {
        conversationId,
        type: ConversationEventType.STATUS_CHANGED,
        actorUserId,
        payload: {
          from: fromStatus,
          to: toStatus,
          ...(reason ? { reason } : {}),
        } as Prisma.InputJsonValue,
        companyId: current.companyId,
      },
    });

    // Push to room: list (status) and timeline (event)
    await this.notifications.emitConversationUpdate(conversationId, {
      status: toStatus,
      lastStatusChangedById: actorUserId,
    });
    await this.notifications.emitConversationEvent(conversationId, {
      eventId: event.id,
      type: event.type,
      actorUserId: event.actorUserId,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    });

    this.logger.debug(
      `Conversation ${conversationId}: ${fromStatus} -> ${toStatus} by ${actorUserId ?? 'system'}`,
    );
    return true;
  }
}
