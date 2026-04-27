import { prisma } from '@/lib/db';

/**
 * Web-side Allegro OAuth helpers. The NestJS API has its own copy in
 * `apps/api/src/modules/messaging/providers/allegro/allegro-oauth.service.ts`
 * — they share the same ChannelConfig storage layout (see top of that file).
 */

export const ALLEGRO_SCOPES = [
	'allegro:api:messaging',
	'allegro:api:profile:read',
	'allegro:api:orders:read',
	'allegro:api:sale:offers:read',
] as const;

export function allegroBaseUrls(env: string | undefined): {
	oauth: string;
	api: string;
} {
	if (env === 'sandbox') {
		return {
			oauth: 'https://allegro.pl.allegrosandbox.pl',
			api: 'https://api.allegro.pl.allegrosandbox.pl',
		};
	}
	return { oauth: 'https://allegro.pl', api: 'https://api.allegro.pl' };
}

export async function loadAllegroConfig(
	channelId: string,
): Promise<Map<string, string>> {
	const rows = await prisma.channelConfig.findMany({
		where: { channelId },
		select: { key: true, value: true },
	});
	return new Map(rows.map((r) => [r.key, r.value]));
}

export async function upsertAllegroConfig(
	channelId: string,
	updates: Record<string, string>,
	secretKeys: string[] = [],
): Promise<void> {
	for (const [key, value] of Object.entries(updates)) {
		await prisma.channelConfig.upsert({
			where: { channelId_key: { channelId, key } },
			update: { value },
			create: {
				channelId,
				key,
				value,
				isSecret: secretKeys.includes(key),
			},
		});
	}
}

export function buildAllegroAuthorizeUrl(args: {
	clientId: string;
	environment: string | undefined;
	redirectUri: string;
	state: string;
}): string {
	const { oauth } = allegroBaseUrls(args.environment);
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: args.clientId,
		redirect_uri: args.redirectUri,
		scope: ALLEGRO_SCOPES.join(' '),
		state: args.state,
	});
	return `${oauth}/auth/oauth/authorize?${params.toString()}`;
}

export async function exchangeAllegroCode(args: {
	channelId: string;
	clientId: string;
	clientSecret: string;
	environment: string | undefined;
	code: string;
	redirectUri: string;
}): Promise<{ accessToken: string; sellerLogin?: string }> {
	const { oauth, api } = allegroBaseUrls(args.environment);
	const basic = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString(
		'base64',
	);

	const tokenResp = await fetch(`${oauth}/auth/oauth/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${basic}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: args.code,
			redirect_uri: args.redirectUri,
		}).toString(),
	});

	if (!tokenResp.ok) {
		const txt = await tokenResp.text();
		throw new Error(`Allegro token exchange ${tokenResp.status}: ${txt}`);
	}

	const tokens = (await tokenResp.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	const expiresAt = new Date(
		Date.now() + tokens.expires_in * 1000,
	).toISOString();

	await upsertAllegroConfig(
		args.channelId,
		{
			oauth_access_token: tokens.access_token,
			oauth_refresh_token: tokens.refresh_token,
			oauth_expires_at: expiresAt,
		},
		['oauth_access_token', 'oauth_refresh_token'],
	);

	let sellerLogin: string | undefined;
	try {
		const meResp = await fetch(`${api}/me`, {
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
				Accept: 'application/vnd.allegro.public.v1+json',
			},
		});
		if (meResp.ok) {
			const me = (await meResp.json()) as { id: string; login: string };
			await upsertAllegroConfig(args.channelId, {
				seller_id: me.id,
				seller_login: me.login,
			});
			sellerLogin = me.login;
		}
	} catch {
		// non-fatal — admin can still use the token even if /me failed
	}

	return { accessToken: tokens.access_token, sellerLogin };
}
