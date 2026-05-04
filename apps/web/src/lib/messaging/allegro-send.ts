import { prisma } from '@/lib/db';
import {
	allegroBaseUrls,
	loadAllegroConfig,
	upsertAllegroConfig,
} from '@/lib/messaging/allegro';
import fs from 'fs';
import path from 'path';

const ALLEGRO_API_VND = 'application/vnd.allegro.public.v1+json';

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
 * Looks up the offer Allegro associates with a discussion thread. Buyers
 * almost always start a thread from a specific listing, so this is the URL
 * we want behind the landing's "Buy" button. Returns null when Allegro has
 * no offer attached or the call fails.
 */
export async function getAllegroThreadOfferUrl(args: {
	companyId: string;
	threadId: string;
}): Promise<string | null> {
	if (!args.companyId || !args.threadId) return null;
	const channel = await prisma.channel.findFirst({
		where: { companyId: args.companyId, type: 'ALLEGRO', isActive: true },
		orderBy: { createdAt: 'asc' },
		select: { id: true },
	});
	if (!channel) return null;
	let token: string;
	let apiBase: string;
	try {
		const got = await getAllegroAccessToken(channel.id);
		token = got.token;
		apiBase = got.apiBase;
	} catch {
		return null;
	}
	try {
		const resp = await fetch(
			`${apiBase}/messaging/threads/${encodeURIComponent(args.threadId)}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: ALLEGRO_API_VND,
				},
			},
		);
		if (!resp.ok) return null;
		const data = (await resp.json()) as {
			subject?: { offer?: { id?: string } | null } | null;
			offer?: { id?: string } | null;
		};
		const offerId = data.subject?.offer?.id ?? data.offer?.id;
		if (!offerId) return null;
		return `https://allegro.pl/oferta/${offerId}`;
	} catch {
		return null;
	}
}

/**
 * Uploads a single attachment to Allegro and returns its attachment id, or
 * null on failure. Allegro requires a two-step flow: declare the attachment
 * (filename + size + mimeType), then PUT the binary to the returned id.
 */
async function uploadAllegroAttachment(args: {
	apiBase: string;
	token: string;
	fileName: string;
	mimeType: string;
	storageKey: string; // path under public/
}): Promise<{ id: string } | { error: string }> {
	const filePath = path.join(process.cwd(), 'public', args.storageKey);
	let buffer: Buffer;
	try {
		buffer = fs.readFileSync(filePath);
	} catch (err) {
		return {
			error: `Local file missing: ${err instanceof Error ? err.message : err}`,
		};
	}

	// Step 1: declare the attachment.
	const declareResp = await fetch(`${args.apiBase}/messaging/message-attachments`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${args.token}`,
			Accept: ALLEGRO_API_VND,
			'Content-Type': ALLEGRO_API_VND,
		},
		body: JSON.stringify({
			filename: args.fileName,
			size: buffer.length,
			mimeType: args.mimeType,
		}),
	});
	if (!declareResp.ok) {
		const txt = await declareResp.text();
		return {
			error: `Allegro declare ${declareResp.status}: ${txt.slice(0, 200)}`,
		};
	}
	const declared = (await declareResp.json()) as { id: string };

	// Step 2: PUT the binary to the same id (octet-stream upload endpoint).
	const uploadResp = await fetch(
		`${args.apiBase}/messaging/message-attachments/${encodeURIComponent(declared.id)}`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${args.token}`,
				Accept: ALLEGRO_API_VND,
				'Content-Type': args.mimeType || 'application/octet-stream',
			},
			body: new Uint8Array(buffer),
		},
	);
	if (!uploadResp.ok) {
		const txt = await uploadResp.text();
		return {
			error: `Allegro upload ${uploadResp.status}: ${txt.slice(0, 200)}`,
		};
	}
	return { id: declared.id };
}

/**
 * Posts a text message into a buyer's Allegro discussion thread on behalf of
 * the company's earliest active ALLEGRO channel. Optional attachments are
 * uploaded first; if any upload fails the message still goes through with
 * the ones that succeeded (the failure is reported in `error`).
 */
export async function sendViaAllegroDirect(args: {
	companyId: string;
	threadId: string;
	text: string;
	attachments?: Array<{
		fileName: string;
		mimeType: string;
		storageKey: string;
	}>;
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

	// Pre-upload attachments to Allegro and collect their ids. Failures don't
	// abort the send — we surface them in `error` and still send what we got.
	const attachmentIds: string[] = [];
	const uploadErrors: string[] = [];
	for (const att of args.attachments ?? []) {
		const result = await uploadAllegroAttachment({
			apiBase,
			token,
			fileName: att.fileName,
			mimeType: att.mimeType,
			storageKey: att.storageKey,
		});
		if ('id' in result) {
			attachmentIds.push(result.id);
		} else {
			uploadErrors.push(`${att.fileName}: ${result.error}`);
		}
	}

	try {
		const messageBody: Record<string, unknown> = { text: args.text };
		if (attachmentIds.length > 0) {
			messageBody.attachments = attachmentIds.map((id) => ({ id }));
		}
		const resp = await fetch(
			`${apiBase}/messaging/threads/${encodeURIComponent(args.threadId)}/messages`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: ALLEGRO_API_VND,
					'Content-Type': ALLEGRO_API_VND,
				},
				body: JSON.stringify(messageBody),
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
		return {
			ok: true,
			messageId: data.id,
			...(uploadErrors.length > 0
				? { error: `Some attachments failed: ${uploadErrors.join('; ')}` }
				: {}),
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : 'Allegro send failed',
		};
	}
}
