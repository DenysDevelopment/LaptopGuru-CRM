import type { NextRequest } from 'next/server';

/**
 * Resolves the public-facing origin (`https://host`) of the current
 * request. Behind Caddy/Nginx, `request.nextUrl.origin` reflects the
 * container's internal listen address (`https://0.0.0.0:3000`), which is
 * useless when handing a URL to a third party (Allegro OAuth, Telegram
 * webhook, etc.). Order of preference:
 *
 *   1. X-Forwarded-Host + -Proto (set by the reverse proxy in prod).
 *   2. Host header (when the request actually hit a real public host).
 *   3. APP_URL / NEXTAUTH_URL env (last-resort pin).
 *   4. request.nextUrl.origin (dev / direct-hit fallback).
 */
export function publicOriginFromRequest(request: NextRequest): string {
	const fwdProto = request.headers.get('x-forwarded-proto');
	const fwdHost = request.headers.get('x-forwarded-host');
	const hostHeader = request.headers.get('host');
	if (fwdHost) {
		return `${fwdProto ?? 'https'}://${fwdHost}`;
	}
	if (
		hostHeader &&
		!hostHeader.startsWith('0.0.0.0') &&
		!hostHeader.startsWith('localhost') &&
		!hostHeader.startsWith('127.0.0.1')
	) {
		return `${fwdProto ?? request.nextUrl.protocol.replace(':', '')}://${hostHeader}`;
	}
	const envUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;
	if (envUrl && !envUrl.includes('localhost')) {
		return envUrl.replace(/\/$/, '');
	}
	return request.nextUrl.origin;
}
