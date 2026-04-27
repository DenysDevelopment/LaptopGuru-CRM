import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { loadAllegroConfig } from '@/lib/messaging/allegro';
import { PERMISSIONS } from '@laptopguru-crm/shared';

/**
 * Tells the Settings UI whether the channel is connected to Allegro and who
 * the seller is. Used to render either the "Подключить" button or the
 * "Connected as X" pill.
 */
export async function GET(request: NextRequest) {
	const { session, error } = await authorize(
		PERMISSIONS.MESSAGING_CHANNELS_READ,
	);
	if (error) return error;

	const channelId = request.nextUrl.searchParams.get('channelId');
	if (!channelId) {
		return NextResponse.json({ error: 'channelId required' }, { status: 400 });
	}

	const channel = await prisma.channel.findUnique({
		where: { id: channelId },
		select: { id: true, type: true, companyId: true },
	});
	if (
		!channel ||
		channel.companyId !== (session.user.companyId ?? '') ||
		channel.type !== 'ALLEGRO'
	) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	const cfg = await loadAllegroConfig(channelId);
	const expiresAtStr = cfg.get('oauth_expires_at');
	const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null;
	const now = new Date();

	return NextResponse.json({
		hasClient: Boolean(cfg.get('oauth_client_id') && cfg.get('oauth_client_secret')),
		connected: Boolean(cfg.get('oauth_access_token')),
		environment: cfg.get('environment') ?? 'production',
		sellerLogin: cfg.get('seller_login') ?? null,
		sellerId: cfg.get('seller_id') ?? null,
		tokenExpiresAt: expiresAtStr ?? null,
		tokenLikelyExpired:
			expiresAt !== null && expiresAt.getTime() - now.getTime() < 60_000,
	});
}
