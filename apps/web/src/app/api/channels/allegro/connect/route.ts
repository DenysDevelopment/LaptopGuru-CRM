import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import {
	buildAllegroAuthorizeUrl,
	buildAllegroRedirectUri,
	loadAllegroConfig,
} from '@/lib/messaging/allegro';
import { PERMISSIONS } from '@laptopguru-crm/shared';

/**
 * Kicks off the Allegro OAuth dance. Required query: ?channelId=<id>.
 * The redirect URI is derived from the request's host so prod and dev
 * just work without env shuffling (must match the URI registered in the
 * Allegro Developer Portal — typically `${origin}/api/channels/allegro/callback`).
 */
export async function GET(request: NextRequest) {
	const { session, error } = await authorize(
		PERMISSIONS.MESSAGING_CHANNELS_WRITE,
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
	if (!channel || channel.companyId !== (session.user.companyId ?? '')) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}
	if (channel.type !== 'ALLEGRO') {
		return NextResponse.json(
			{ error: 'Channel is not ALLEGRO' },
			{ status: 400 },
		);
	}

	const cfg = await loadAllegroConfig(channelId);
	const clientId = cfg.get('oauth_client_id');
	if (!clientId) {
		return NextResponse.json(
			{ error: 'Set oauth_client_id and oauth_client_secret first' },
			{ status: 400 },
		);
	}

	const redirectUri = buildAllegroRedirectUri(request);

	const url = buildAllegroAuthorizeUrl({
		clientId,
		environment: cfg.get('environment'),
		redirectUri,
		state: channelId,
	});

	return NextResponse.redirect(url);
}
