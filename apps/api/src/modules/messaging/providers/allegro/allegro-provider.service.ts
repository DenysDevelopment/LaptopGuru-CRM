import { Injectable, Logger } from '@nestjs/common';
import {
	ChannelType,
	MessageDeliveryStatus,
} from '../../../../generated/prisma/client';
import {
	ChannelProvider,
	SendTextParams,
	SendMediaParams,
	SendResult,
	ParsedInboundMessage,
} from '../provider.interface';
import { AllegroOAuthService } from './allegro-oauth.service';

/**
 * Sends and receives messages on Allegro Discussions.
 *
 * The caller must put `channel_id` into `metadata` so the provider can fetch
 * (and silently refresh) the OAuth access token via `AllegroOAuthService`.
 *
 * Inbound messages on Allegro arrive via polling — see `AllegroPollProcessor`.
 * `parseInboundEvent` is therefore a no-op stub required by the
 * `ChannelProvider` contract; the webhook subsystem must never route an
 * `ALLEGRO` event here.
 */
@Injectable()
export class AllegroProviderService implements ChannelProvider {
	private readonly logger = new Logger(AllegroProviderService.name);
	readonly channelType = ChannelType.ALLEGRO;

	private readonly ACCEPT_HEADER = 'application/vnd.allegro.public.v1+json';

	constructor(private readonly oauth: AllegroOAuthService) {}

	private async authedHeaders(channelId: string): Promise<HeadersInit> {
		const token = await this.oauth.getAccessToken(channelId);
		return {
			Authorization: `Bearer ${token}`,
			Accept: this.ACCEPT_HEADER,
			'Content-Type': this.ACCEPT_HEADER,
		};
	}

	private async apiBase(channelId: string): Promise<string> {
		const cfg = await this.oauth.loadConfig(channelId);
		return this.oauth.apiBaseUrl(cfg.get('environment'));
	}

	async sendTextMessage(params: SendTextParams): Promise<SendResult> {
		const channelId = params.metadata?.['channel_id'];
		if (!channelId) {
			return {
				success: false,
				deliveryStatus: MessageDeliveryStatus.FAILED,
				error: 'Missing channel_id in metadata',
			};
		}

		try {
			const headers = await this.authedHeaders(channelId);
			const base = await this.apiBase(channelId);
			const threadId = params.recipientId;

			const resp = await fetch(
				`${base}/messaging/threads/${threadId}/messages`,
				{
					method: 'POST',
					headers,
					body: JSON.stringify({ text: params.text }),
				},
			);

			if (!resp.ok) {
				const txt = await resp.text();
				return {
					success: false,
					deliveryStatus: MessageDeliveryStatus.FAILED,
					error: `Allegro ${resp.status}: ${txt.slice(0, 300)}`,
				};
			}

			const data = (await resp.json()) as { id: string };
			return {
				success: true,
				externalId: data.id,
				deliveryStatus: MessageDeliveryStatus.SENT,
				rawResponse: data as unknown as Record<string, unknown>,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Allegro sendTextMessage failed: ${msg}`);
			return {
				success: false,
				deliveryStatus: MessageDeliveryStatus.FAILED,
				error: msg,
			};
		}
	}

	async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
		// Allegro supports attachments via /messaging/message-attachments —
		// implementation deferred to a follow-up. For now, fall back to text:
		// caption + media URL inline.
		return this.sendTextMessage({
			channelType: params.channelType,
			recipientId: params.recipientId,
			text: [params.caption, params.mediaUrl].filter(Boolean).join('\n'),
			metadata: params.metadata,
		});
	}

	async parseInboundEvent(_rawPayload: string): Promise<ParsedInboundMessage> {
		throw new Error(
			'AllegroProvider.parseInboundEvent is unused — inbound is handled via polling',
		);
	}

	async validateConfig(config: Map<string, string>): Promise<boolean> {
		return Boolean(
			config.get('oauth_client_id') &&
				config.get('oauth_client_secret') &&
				config.get('oauth_access_token'),
		);
	}

	async testConnection(config: Map<string, string>): Promise<boolean> {
		const access = config.get('oauth_access_token');
		if (!access) return false;
		const env = config.get('environment');
		const base = this.oauth.apiBaseUrl(env);
		try {
			const resp = await fetch(`${base}/me`, {
				headers: {
					Authorization: `Bearer ${access}`,
					Accept: this.ACCEPT_HEADER,
				},
			});
			return resp.ok;
		} catch {
			return false;
		}
	}

	supportsTypingIndicator(): boolean {
		return false;
	}

	supportsReadReceipts(): boolean {
		return true;
	}

	// ─── Polling-side helpers (used by AllegroPollProcessor) ──────────────────

	async listThreads(
		channelId: string,
		opts: { limit?: number; offset?: number } = {},
	): Promise<{
		threads: Array<{
			id: string;
			lastMessageDateTime: string;
			// Allegro returns at least one of id/login; both are optional
			// in the public schema so callers must defensive-check.
			interlocutor: { id?: string; login?: string };
			read: boolean;
		}>;
		count: number;
	}> {
		const headers = await this.authedHeaders(channelId);
		const base = await this.apiBase(channelId);
		const url = new URL(`${base}/messaging/threads`);
		// Allegro hard-caps `limit` at 20 for this endpoint (422 above 20).
		url.searchParams.set('limit', String(Math.min(opts.limit ?? 20, 20)));
		url.searchParams.set('offset', String(opts.offset ?? 0));
		const resp = await fetch(url.toString(), { headers });
		if (!resp.ok) {
			throw new Error(
				`Allegro listThreads ${resp.status}: ${(await resp.text()).slice(0, 300)}`,
			);
		}
		return (await resp.json()) as {
			threads: Array<{
				id: string;
				lastMessageDateTime: string;
				interlocutor: { id: string; login: string };
				read: boolean;
			}>;
			count: number;
		};
	}

	async listMessages(
		channelId: string,
		threadId: string,
		opts: { limit?: number; offset?: number } = {},
	): Promise<{
		messages: Array<{
			id: string;
			text: string;
			createdAt: string;
			subject?: string | null;
			type?: string;
			relatesTo?: {
				offer?: { id: string } | null;
				order?: { id: string } | null;
			};
			author: { id?: string; login?: string; isInterlocutor?: boolean };
			attachments?: Array<{
				id: string;
				fileName?: string;
				mimeType?: string;
				size?: number;
				status?: string;
			}>;
		}>;
	}> {
		const headers = await this.authedHeaders(channelId);
		const base = await this.apiBase(channelId);
		const url = new URL(`${base}/messaging/threads/${threadId}/messages`);
		url.searchParams.set('limit', String(Math.min(opts.limit ?? 20, 20)));
		url.searchParams.set('offset', String(opts.offset ?? 0));
		const resp = await fetch(url.toString(), { headers });
		if (!resp.ok) {
			throw new Error(
				`Allegro listMessages ${resp.status}: ${(await resp.text()).slice(0, 300)}`,
			);
		}
		return (await resp.json()) as {
			messages: Array<{
				id: string;
				text: string;
				createdAt: string;
				subject?: string | null;
				type?: string;
				relatesTo?: {
					offer?: { id: string } | null;
					order?: { id: string } | null;
				};
				author: { id: string; login: string; isInterlocutor: boolean };
				attachments?: Array<{
					id: string;
					fileName?: string;
					mimeType?: string;
					size?: number;
					status?: string;
				}>;
			}>;
		};
	}

	/**
	 * Fetches one of the seller's product-offers by id and shapes it into the
	 * minimal subset the inbox sidebar needs (image, formatted price, name).
	 * Returns null on 404/403/other errors so the caller can render gracefully.
	 */
	async getOffer(
		channelId: string,
		offerId: string,
	): Promise<{
		name: string;
		imageUrl: string | null;
		priceText: string | null;
	} | null> {
		try {
			const headers = await this.authedHeaders(channelId);
			const base = await this.apiBase(channelId);
			const resp = await fetch(
				`${base}/sale/product-offers/${encodeURIComponent(offerId)}`,
				{ headers },
			);
			if (!resp.ok) {
				this.logger.warn(
					`Allegro getOffer ${offerId} ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
				);
				return null;
			}
			const data = (await resp.json()) as {
				name?: string;
				images?: Array<{ url?: string }>;
				sellingMode?: {
					price?: { amount?: string; currency?: string };
				};
			};
			const name = data.name ?? '';
			const imageUrl = data.images?.find((i) => i.url)?.url ?? null;
			const amount = data.sellingMode?.price?.amount;
			const currency = data.sellingMode?.price?.currency;
			const priceText = amount && currency ? `${amount} ${currency}` : null;
			return { name, imageUrl, priceText };
		} catch (err) {
			this.logger.warn(
				`Allegro getOffer ${offerId} threw: ${err instanceof Error ? err.message : err}`,
			);
			return null;
		}
	}

	/**
	 * Downloads an Allegro message attachment by id and returns the binary
	 * along with the filename inferred from headers (or null if download
	 * fails). Allegro responds with the file directly OR a 302 to a CDN URL —
	 * `fetch` follows redirects automatically.
	 */
	async downloadAttachment(
		channelId: string,
		attachmentId: string,
	): Promise<{ buffer: Buffer; mimeType: string; fileName?: string } | null> {
		const headers = await this.authedHeaders(channelId);
		const base = await this.apiBase(channelId);
		const resp = await fetch(
			`${base}/messaging/message-attachments/${encodeURIComponent(attachmentId)}`,
			{ headers: { Authorization: (headers as Record<string, string>).Authorization } },
		);
		if (!resp.ok) {
			this.logger.warn(
				`Allegro attachment ${attachmentId} download ${resp.status}`,
			);
			return null;
		}
		const ab = await resp.arrayBuffer();
		const buffer = Buffer.from(ab);
		const mimeType = resp.headers.get('content-type') ?? 'application/octet-stream';
		// content-disposition: attachment; filename="foo.jpg"
		const cd = resp.headers.get('content-disposition') ?? '';
		const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
		const fileName = m ? decodeURIComponent(m[1]) : undefined;
		return { buffer, mimeType, fileName };
	}
}
