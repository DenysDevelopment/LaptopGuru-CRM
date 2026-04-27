import { prisma } from '@/lib/db';
import {
  ConversationStatus,
  ConversationEventType,
  type Prisma,
} from '@/generated/prisma/client';

/**
 * 4-hour cooldown after a manual close. Within this window an inbound
 * message will NOT auto-reopen the conversation — protects against the
 * "client keeps writing, admin keeps closing" loop.
 */
const MANUAL_CLOSE_GRACE_MS = 4 * 60 * 60 * 1000;

interface TransitionInput {
	conversationId: string;
	toStatus: ConversationStatus;
	/** null = system / cron / inbound webhook */
	actorUserId: string | null;
	reason?: string;
	/**
	 * If provided, the UPDATE only succeeds when the current status is one of
	 * these. Used for auto-transitions so we don't overwrite later changes.
	 */
	requireFromStatus?: ConversationStatus[];
	/**
	 * When true and the current status is RESOLVED with a manual closer set
	 * within the grace window, the transition is suppressed.
	 */
	respectManualCloseGrace?: boolean;
}

interface TransitionResult {
	transitioned: boolean;
	from?: ConversationStatus;
	to?: ConversationStatus;
	eventId?: string;
}

/**
 * Atomic conversation status change with audit. Returns `transitioned=false`
 * when the status was already at `toStatus` or didn't match `requireFromStatus`
 * (race-safe no-op).
 */
export async function transitionConversationStatus(
	input: TransitionInput,
): Promise<TransitionResult> {
	const {
		conversationId,
		toStatus,
		actorUserId,
		reason,
		requireFromStatus,
		respectManualCloseGrace = false,
	} = input;

	const current = await prisma.conversation.findUnique({
		where: { id: conversationId },
		select: {
			status: true,
			companyId: true,
			lastStatusChangedById: true,
			lastStatusChangedAt: true,
		},
	});
	if (!current) return { transitioned: false };
	if (current.status === toStatus) return { transitioned: false };
	if (requireFromStatus && !requireFromStatus.includes(current.status)) {
		return { transitioned: false };
	}
	if (
		respectManualCloseGrace &&
		current.status === ConversationStatus.RESOLVED &&
		current.lastStatusChangedById !== null &&
		current.lastStatusChangedAt &&
		Date.now() - current.lastStatusChangedAt.getTime() <
			MANUAL_CLOSE_GRACE_MS
	) {
		return { transitioned: false };
	}

	const fromStatus = current.status;
	const now = new Date();

	const result = await prisma.conversation.updateMany({
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
	if (result.count === 0) return { transitioned: false };

	const event = await prisma.conversationEvent.create({
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

	return {
		transitioned: true,
		from: fromStatus,
		to: toStatus,
		eventId: event.id,
	};
}
