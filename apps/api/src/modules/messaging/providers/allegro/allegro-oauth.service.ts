import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Allegro OAuth2 helper. Handles authorize-URL building, code exchange and
 * silent refresh. Tokens live in `ChannelConfig` keyed by:
 *
 *   oauth_client_id, oauth_client_secret, environment ('sandbox'|'production')
 *   oauth_access_token, oauth_refresh_token, oauth_expires_at  (rfc3339 string)
 *   seller_login, seller_id  (cached after first /me call)
 *
 * Defaults to production (`https://allegro.pl` + `https://api.allegro.pl`); set
 * `environment=sandbox` on the channel config to flip to sandbox URLs.
 */
@Injectable()
export class AllegroOAuthService {
	private readonly logger = new Logger(AllegroOAuthService.name);

	private readonly REFRESH_AHEAD_SEC = 60;

	constructor(private readonly prisma: PrismaService) {}

	private envBaseUrls(env: string | undefined) {
		if (env === 'sandbox') {
			return {
				oauth: 'https://allegro.pl.allegrosandbox.pl',
				api: 'https://api.allegro.pl.allegrosandbox.pl',
			};
		}
		return {
			oauth: 'https://allegro.pl',
			api: 'https://api.allegro.pl',
		};
	}

	async loadConfig(channelId: string): Promise<Map<string, string>> {
		const rows = await this.prisma.raw.channelConfig.findMany({
			where: { channelId },
			select: { key: true, value: true },
		});
		return new Map(rows.map((r) => [r.key, r.value]));
	}

	private async upsertConfig(
		channelId: string,
		updates: Record<string, string>,
		secretKeys: string[] = [],
	) {
		for (const [key, value] of Object.entries(updates)) {
			await this.prisma.raw.channelConfig.upsert({
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

	/**
	 * Build the URL to send the user to. State carries channelId so the
	 * callback knows which channel to attach the tokens to.
	 */
	async buildAuthorizeUrl(
		channelId: string,
		redirectUri: string,
	): Promise<string> {
		const cfg = await this.loadConfig(channelId);
		const clientId = cfg.get('oauth_client_id');
		if (!clientId) {
			throw new Error('Allegro client_id missing on channel');
		}
		const { oauth } = this.envBaseUrls(cfg.get('environment'));
		const scopes = [
			'allegro:api:messaging',
			'allegro:api:profile:read',
			'allegro:api:orders:read',
			'allegro:api:sale:offers:read',
		].join(' ');
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: scopes,
			state: channelId,
		});
		return `${oauth}/auth/oauth/authorize?${params.toString()}`;
	}

	private basicAuth(clientId: string, clientSecret: string): string {
		return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	}

	private async postForm<T>(url: string, body: URLSearchParams, basic: string): Promise<T> {
		const resp = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${basic}`,
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: body.toString(),
		});
		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`Allegro OAuth ${resp.status}: ${text}`);
		}
		return (await resp.json()) as T;
	}

	/**
	 * Exchange an authorization code for the initial access/refresh tokens
	 * and persist them. Also caches seller_login/seller_id from /me.
	 */
	async exchangeCode(
		channelId: string,
		code: string,
		redirectUri: string,
	): Promise<void> {
		const cfg = await this.loadConfig(channelId);
		const clientId = cfg.get('oauth_client_id');
		const clientSecret = cfg.get('oauth_client_secret');
		if (!clientId || !clientSecret) {
			throw new Error('Allegro client credentials missing on channel');
		}
		const { oauth, api } = this.envBaseUrls(cfg.get('environment'));

		const tokens = await this.postForm<{
			access_token: string;
			refresh_token: string;
			expires_in: number;
		}>(
			`${oauth}/auth/oauth/token`,
			new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
			}),
			this.basicAuth(clientId, clientSecret),
		);

		const expiresAt = new Date(
			Date.now() + tokens.expires_in * 1000,
		).toISOString();

		await this.upsertConfig(
			channelId,
			{
				oauth_access_token: tokens.access_token,
				oauth_refresh_token: tokens.refresh_token,
				oauth_expires_at: expiresAt,
			},
			['oauth_access_token', 'oauth_refresh_token'],
		);

		// Try to cache seller info — non-fatal if scope missing.
		try {
			const meResp = await fetch(`${api}/me`, {
				headers: {
					Authorization: `Bearer ${tokens.access_token}`,
					Accept: 'application/vnd.allegro.public.v1+json',
				},
			});
			if (meResp.ok) {
				const me = (await meResp.json()) as { id: string; login: string };
				await this.upsertConfig(channelId, {
					seller_id: me.id,
					seller_login: me.login,
				});
			}
		} catch (err) {
			this.logger.warn(
				`Failed to fetch /me for channel ${channelId}: ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	/**
	 * Refreshes the access token if it expires within REFRESH_AHEAD_SEC.
	 * Returns a valid access token. Throws if refresh-token is gone or
	 * Allegro rejects.
	 */
	async getAccessToken(channelId: string): Promise<string> {
		const cfg = await this.loadConfig(channelId);
		const access = cfg.get('oauth_access_token');
		const refresh = cfg.get('oauth_refresh_token');
		const expiresAt = cfg.get('oauth_expires_at');
		if (!access || !refresh) {
			throw new Error(
				`Allegro channel ${channelId} not connected — re-authorize`,
			);
		}

		const expMs = expiresAt ? Date.parse(expiresAt) : 0;
		if (expMs - Date.now() > this.REFRESH_AHEAD_SEC * 1000) {
			return access;
		}

		// Refresh
		const clientId = cfg.get('oauth_client_id')!;
		const clientSecret = cfg.get('oauth_client_secret')!;
		const { oauth } = this.envBaseUrls(cfg.get('environment'));

		const tokens = await this.postForm<{
			access_token: string;
			refresh_token: string;
			expires_in: number;
		}>(
			`${oauth}/auth/oauth/token`,
			new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refresh,
			}),
			this.basicAuth(clientId, clientSecret),
		);

		const newExpires = new Date(
			Date.now() + tokens.expires_in * 1000,
		).toISOString();

		await this.upsertConfig(
			channelId,
			{
				oauth_access_token: tokens.access_token,
				oauth_refresh_token: tokens.refresh_token,
				oauth_expires_at: newExpires,
			},
			['oauth_access_token', 'oauth_refresh_token'],
		);

		return tokens.access_token;
	}

	apiBaseUrl(environment: string | undefined): string {
		return this.envBaseUrls(environment).api;
	}
}
