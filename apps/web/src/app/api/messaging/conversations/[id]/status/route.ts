import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { transitionConversationStatus } from '@/lib/messaging/transition-status';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { ConversationStatus } from '@/generated/prisma/client';

const VALID_STATUSES: ConversationStatus[] = [
	'NEW',
	'OPEN',
	'WAITING_REPLY',
	'RESOLVED',
	'CLOSED',
	'SPAM',
];

/**
 * Manual status override (UI dropdown / "Завершить" button).
 *
 *   - RESOLVED / CLOSED → requires MESSAGING_CONVERSATIONS_CLOSE
 *   - any other status  → requires MESSAGING_CONVERSATIONS_WRITE
 */
export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const body = (await request.json().catch(() => ({}))) as {
		status?: ConversationStatus;
		reason?: string;
	};
	const target = body.status;
	if (!target || !VALID_STATUSES.includes(target)) {
		return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
	}

	const requiresClose =
		target === 'RESOLVED' || target === 'CLOSED' || target === 'SPAM';
	const required = requiresClose
		? PERMISSIONS.MESSAGING_CONVERSATIONS_CLOSE
		: PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE;

	const { session, error } = await authorize(required);
	if (error) return error;

	const { id } = await params;
	const conv = await prisma.conversation.findUnique({
		where: { id },
		select: { companyId: true, status: true },
	});
	if (!conv || conv.companyId !== (session.user.companyId ?? '')) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	const result = await transitionConversationStatus({
		conversationId: id,
		toStatus: target,
		actorUserId: session.user.id,
		reason: body.reason ?? 'manual-override',
		// No requireFromStatus — explicit user override always wins
	});

	return NextResponse.json({
		ok: true,
		transitioned: result.transitioned,
		from: result.from ?? conv.status,
		to: result.to ?? target,
	});
}
