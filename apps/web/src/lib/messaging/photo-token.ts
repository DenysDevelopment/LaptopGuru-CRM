import crypto from 'crypto';

// Stateless HMAC-signed token used by the QR-photo flow. Payload binds the
// token to a specific conversation + agent + company + expiry. No DB row,
// so there's no replay-revoke unless we add it later — we accept that within
// the short TTL the token is valid for any number of uploads.

const SECRET = process.env.JWT_SECRET || 'dev-photo-token-secret';
const ISSUER_VERSION = 'v1';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface PhotoTokenPayload {
	v: typeof ISSUER_VERSION;
	cid: string; // conversationId
	uid: string; // agent userId
	coid: string; // companyId
	exp: number; // unix-ms
}

function b64url(buf: Buffer): string {
	return buf
		.toString('base64')
		.replace(/=+$/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

function fromB64url(s: string): Buffer {
	const pad = (4 - (s.length % 4)) % 4;
	return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

function hmac(input: string): Buffer {
	return crypto.createHmac('sha256', SECRET).update(input).digest();
}

export function signPhotoToken(args: {
	conversationId: string;
	userId: string;
	companyId: string;
	ttlMs?: number;
}): { token: string; expiresAt: number } {
	const ttl = args.ttlMs ?? TTL_MS;
	const payload: PhotoTokenPayload = {
		v: ISSUER_VERSION,
		cid: args.conversationId,
		uid: args.userId,
		coid: args.companyId,
		exp: Date.now() + ttl,
	};
	const body = b64url(Buffer.from(JSON.stringify(payload)));
	const sig = b64url(hmac(body));
	return { token: `${body}.${sig}`, expiresAt: payload.exp };
}

export type VerifyResult =
	| { ok: true; payload: PhotoTokenPayload }
	| { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyPhotoToken(token: string): VerifyResult {
	if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
	const dot = token.indexOf('.');
	if (dot < 1 || dot === token.length - 1) return { ok: false, reason: 'malformed' };

	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	const expectedSig = b64url(hmac(body));
	const a = Buffer.from(sig);
	const b = Buffer.from(expectedSig);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		return { ok: false, reason: 'bad_signature' };
	}

	let payload: PhotoTokenPayload;
	try {
		payload = JSON.parse(fromB64url(body).toString('utf8'));
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (
		!payload ||
		payload.v !== ISSUER_VERSION ||
		typeof payload.cid !== 'string' ||
		typeof payload.uid !== 'string' ||
		typeof payload.coid !== 'string' ||
		typeof payload.exp !== 'number'
	) {
		return { ok: false, reason: 'malformed' };
	}
	if (payload.exp < Date.now()) return { ok: false, reason: 'expired' };
	return { ok: true, payload };
}
