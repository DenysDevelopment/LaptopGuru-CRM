import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { signPhotoToken } from '@/lib/messaging/photo-token';

export async function POST(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { session, error } = await authorize(PERMISSIONS.MESSAGING_MESSAGES_SEND);
	if (error) return error;

	const { id } = await params;

	const conversation = await prisma.conversation.findUnique({
		where: { id },
		select: { id: true, companyId: true },
	});
	if (
		!conversation ||
		conversation.companyId !== (session.user!.companyId ?? '')
	) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	const { token, expiresAt } = signPhotoToken({
		conversationId: id,
		userId: session.user!.id,
		companyId: session.user!.companyId ?? '',
	});

	const appUrl = process.env.APP_URL || 'http://localhost:3000';
	const mobileUrl = `${appUrl}/m/photo/${token}`;

	return NextResponse.json({
		token,
		mobileUrl,
		expiresAt: new Date(expiresAt).toISOString(),
	});
}
