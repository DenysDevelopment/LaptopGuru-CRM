import { prisma } from '@/lib/db';
import {
	allegroBaseUrls,
	loadAllegroConfig,
	upsertAllegroConfig,
} from '@/lib/messaging/allegro';

const REFRESH_AHEAD_SEC = 60;

/**
 * Resolves a fresh Allegro access token for the given channel. Refreshes the
 * stored token if it expires within REFRESH_AHEAD_SEC. Throws when the
 * channel hasn't been authorized yet.
 */
async function getAllegroAccessToken(channelId: string): Promise<{
	token: string;
	apiBase: string;
}> {
	const cfg = await loadAllegroConfig(channelId);
	const access = cfg.get('oauth_access_token');
	const refresh = cfg.get('oauth_refresh_token');
	const expiresAt = cfg.get('oauth_expires_at');
	const env = cfg.get('environment');
	const { oauth, api } = allegroBaseUrls(env);

	if (!access || !refresh) {
		throw new Error('Allegro channel not connected — re-authorize first');
	}

	const expMs = expiresAt ? Date.parse(expiresAt) : 0;
	if (expMs - Date.now() > REFRESH_AHEAD_SEC * 1000) {
		return { token: access, apiBase: api };
	}

	const clientId = cfg.get('oauth_client_id');
	const clientSecret = cfg.get('oauth_client_secret');
	if (!clientId || !clientSecret) {
		throw new Error('Allegro client credentials missing on channel');
	}
	const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

	const resp = await fetch(`${oauth}/auth/oauth/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${basic}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refresh,
		}).toString(),
	});
	if (!resp.ok) {
		const txt = await resp.text();
		throw new Error(`Allegro refresh failed ${resp.status}: ${txt}`);
	}
	const tokens = (await resp.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	const newExpires = new Date(
		Date.now() + tokens.expires_in * 1000,
	).toISOString();

	await upsertAllegroConfig(
		channelId,
		{
			oauth_access_token: tokens.access_token,
			oauth_refresh_token: tokens.refresh_token,
			oauth_expires_at: newExpires,
		},
		['oauth_access_token', 'oauth_refresh_token'],
	);

	return { token: tokens.access_token, apiBase: api };
}

/**
 * Posts a text message into a buyer's Allegro discussion thread on behalf of
 * the company's earliest active ALLEGRO channel. Returns delivery status.
 */
export async function sendViaAllegroDirect(args: {
	companyId: string;
	threadId: string;
	text: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
	if (!args.companyId) return { ok: false, error: 'No companyId' };

	const channel = await prisma.channel.findFirst({
		where: {
			companyId: args.companyId,
			type: 'ALLEGRO',
			isActive: true,
		},
		orderBy: { createdAt: 'asc' },
		select: { id: true },
	});
	if (!channel) {
		return { ok: false, error: 'No active ALLEGRO channel for company' };
	}

	let token: string;
	let apiBase: string;
	try {
		const got = await getAllegroAccessToken(channel.id);
		token = got.token;
		apiBase = got.apiBase;
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : 'Token fetch failed',
		};
	}

	try {
		const resp = await fetch(
			`${apiBase}/messaging/threads/${encodeURIComponent(args.threadId)}/messages`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.allegro.public.v1+json',
					'Content-Type': 'application/vnd.allegro.public.v1+json',
				},
				body: JSON.stringify({ text: args.text }),
			},
		);
		if (!resp.ok) {
			const txt = await resp.text();
			return {
				ok: false,
				error: `Allegro ${resp.status}: ${txt.slice(0, 300)}`,
			};
		}
		const data = (await resp.json()) as { id: string };
		return { ok: true, messageId: data.id };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : 'Allegro send failed',
		};
	}
}
