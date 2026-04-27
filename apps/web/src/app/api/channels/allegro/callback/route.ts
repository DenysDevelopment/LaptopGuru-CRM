import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import {
	exchangeAllegroCode,
	loadAllegroConfig,
} from '@/lib/messaging/allegro';
import { PERMISSIONS } from '@laptopguru-crm/shared';

/**
 * OAuth callback. Allegro redirects here with `?code=...&state=<channelId>`.
 * We exchange the code for tokens, persist them on the channel, and bounce
 * the user back to the channel-edit page with a status flag.
 */
export async function GET(request: NextRequest) {
	const { session, error } = await authorize(
		PERMISSIONS.MESSAGING_CHANNELS_WRITE,
	);
	if (error) return error;

	const code = request.nextUrl.searchParams.get('code');
	const state = request.nextUrl.searchParams.get('state');
	const errParam = request.nextUrl.searchParams.get('error');

	if (errParam) {
		return NextResponse.redirect(
			new URL(
				`/settings/channels?allegro=error&reason=${encodeURIComponent(errParam)}`,
				request.nextUrl.origin,
			),
		);
	}

	if (!code || !state) {
		return NextResponse.json(
			{ error: 'code and state required' },
			{ status: 400 },
		);
	}

	const channel = await prisma.channel.findUnique({
		where: { id: state },
		select: { id: true, type: true, companyId: true },
	});
	if (
		!channel ||
		channel.companyId !== (session.user.companyId ?? '') ||
		channel.type !== 'ALLEGRO'
	) {
		return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
	}

	const cfg = await loadAllegroConfig(channel.id);
	const clientId = cfg.get('oauth_client_id');
	const clientSecret = cfg.get('oauth_client_secret');
	if (!clientId || !clientSecret) {
		return NextResponse.json(
			{ error: 'Channel is missing client credentials' },
			{ status: 400 },
		);
	}

	const origin = request.nextUrl.origin;
	const redirectUri =
		process.env.ALLEGRO_OAUTH_REDIRECT_URI ??
		`${origin}/api/channels/allegro/callback`;

	try {
		const { sellerLogin } = await exchangeAllegroCode({
			channelId: channel.id,
			clientId,
			clientSecret,
			environment: cfg.get('environment'),
			code,
			redirectUri,
		});
		const successUrl = new URL(
			`/settings/channels?allegro=connected&channel=${channel.id}${
				sellerLogin ? `&login=${encodeURIComponent(sellerLogin)}` : ''
			}`,
			origin,
		);
		return NextResponse.redirect(successUrl);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown';
		return NextResponse.redirect(
			new URL(
				`/settings/channels?allegro=error&reason=${encodeURIComponent(msg)}`,
				origin,
			),
		);
	}
}
