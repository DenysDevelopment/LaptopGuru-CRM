import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { AllegroProviderService } from '../providers/allegro/allegro-provider.service';
import { AllegroOAuthService } from '../providers/allegro/allegro-oauth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebSseBridgeService } from '../notifications/web-sse-bridge.service';
import { ConversationStatusService } from '../conversations/status.service';
import { ConversationStatus } from '../../../generated/prisma/client';
import { decodeEntities } from '../../../lib/decode-entities';

// Inbound Allegro attachments are saved into the Web app's public/uploads
// tree so the existing storageUrl convention (`/uploads/...`) just works for
// the browser. The Web process serves them statically.
const WEB_UPLOADS_DIR = path.resolve(
	process.cwd(),
	'../web/public/uploads/messaging',
);

/**
 * Allegro doesn't push real-time webhooks for messages — sellers are
 * expected to poll `/messaging/threads`. This cron runs once per minute,
 * picks up active ALLEGRO channels and ingests anything newer than the
 * stored `last_poll_at` cursor. Inbound messages create Contacts /
 * Conversations / Messages exactly like the rest of the messaging stack
 * so existing /messaging UI just works.
 */
@Injectable()
export class AllegroPollCron {
	private readonly logger = new Logger(AllegroPollCron.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly provider: AllegroProviderService,
		private readonly oauth: AllegroOAuthService,
		private readonly notifications: NotificationsService,
		private readonly statusService: ConversationStatusService,
		private readonly webBridge: WebSseBridgeService,
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async run(): Promise<void> {
		const channels = await this.prisma.raw.channel.findMany({
			where: { type: 'ALLEGRO', isActive: true },
			select: { id: true, companyId: true },
		});
		if (channels.length === 0) return;

		await Promise.all(
			channels.map(async (channel) => {
				try {
					await this.pollChannel(channel.id, channel.companyId);
				} catch (err) {
					this.logger.warn(
						`Allegro poll failed for channel ${channel.id}: ${err instanceof Error ? err.message : err}`,
					);
				}
			}),
		);
	}

	private async pollChannel(channelId: string, companyId: string): Promise<void> {
		const cfg = await this.oauth.loadConfig(channelId);
		if (!cfg.get('oauth_access_token')) return; // not authorized yet

		const lastPollStr = cfg.get('last_poll_at');
		const lastPoll = lastPollStr ? new Date(lastPollStr) : new Date(0);
		const sellerId = cfg.get('seller_id') ?? null;

		// Pull recent threads (newest first); stop when older than cursor.
		// Allegro caps `limit` at 20 for /messaging/threads.
		const { threads } = await this.provider.listThreads(channelId, {
			limit: 20,
			offset: 0,
		});

		let newest = lastPoll;
		const fresh: typeof threads = [];
		for (const t of threads) {
			const lastMsgAt = new Date(t.lastMessageDateTime);
			if (lastMsgAt > newest) newest = lastMsgAt;
			if (lastMsgAt > lastPoll) fresh.push(t);
		}

		await Promise.all(
			fresh.map((t) =>
				this.ingestThread(channelId, companyId, t, sellerId, lastPoll).catch(
					(err) => {
						this.logger.warn(
							`Allegro thread ${t.id} ingest failed: ${err instanceof Error ? err.message : err}`,
						);
					},
				),
			),
		);

		await this.prisma.raw.channelConfig.upsert({
			where: { channelId_key: { channelId, key: 'last_poll_at' } },
			update: { value: newest.toISOString() },
			create: {
				channelId,
				key: 'last_poll_at',
				value: newest.toISOString(),
				isSecret: false,
			},
		});
	}

	private async ingestThread(
		channelId: string,
		companyId: string,
		thread: {
			id: string;
			lastMessageDateTime: string;
			interlocutor: { id?: string; login?: string };
		},
		sellerId: string | null,
		cursor: Date,
	): Promise<void> {
		// Allegro's `interlocutor` reliably has `login`; `id` is sometimes
		// missing. Fall back to login as the contact identifier.
		const interId = thread.interlocutor.id ?? thread.interlocutor.login;
		const interLogin =
			thread.interlocutor.login ?? thread.interlocutor.id ?? 'unknown';
		if (!interId) {
			this.logger.warn(
				`Skipping Allegro thread ${thread.id}: no interlocutor id/login`,
			);
			return;
		}

		// Find or create Contact + ContactChannel for this Allegro buyer.
		let contactChannel = await this.prisma.raw.contactChannel.findFirst({
			where: {
				companyId,
				channelType: 'ALLEGRO',
				identifier: interId,
			},
		});
		let contactId: string;
		if (contactChannel) {
			contactId = contactChannel.contactId;
		} else {
			const contact = await this.prisma.raw.contact.create({
				data: {
					displayName: interLogin,
					companyId,
				},
			});
			contactId = contact.id;
			contactChannel = await this.prisma.raw.contactChannel.create({
				data: {
					contactId,
					channelType: 'ALLEGRO',
					identifier: interId,
					companyId,
				},
			});
		}

		// Find or create Conversation by externalId=thread.id
		let conversation = await this.prisma.raw.conversation.findFirst({
			where: { channelId, externalId: thread.id },
			select: { id: true, status: true },
		});
		let isNewConversation = false;
		if (!conversation) {
			const created = await this.prisma.raw.conversation.create({
				data: {
					contactId,
					channelId,
					externalId: thread.id,
					status: ConversationStatus.NEW,
					lastMessageAt: new Date(thread.lastMessageDateTime),
					companyId,
				},
				select: { id: true, status: true },
			});
			conversation = created;
			isNewConversation = true;
			await this.prisma.raw.conversationEvent.create({
				data: {
					conversationId: created.id,
					type: 'CONVERSATION_CREATED',
					actorUserId: null,
					payload: { source: 'allegro' },
					companyId,
				},
			});
		}

		// Pull messages newer than cursor; Allegro returns them oldest first.
		// Allegro caps `limit` at 20 for /messaging/threads/{id}/messages.
		const { messages } = await this.provider.listMessages(channelId, thread.id, {
			limit: 20,
		});

		// Allegro tags every message in an inquiry thread with the related
		// offer id (and an offer-name `subject` on the first one). Pull it once
		// per conversation so the sidebar can show a product card. Cheap idempotent
		// query — DB write is skipped below if the offer is already known.
		await this.maybePopulateAllegroOffer(channelId, conversation.id, messages);

		const candidates = messages.filter((m) => new Date(m.createdAt) > cursor);
		const existingIds = new Set<string>();
		if (candidates.length > 0) {
			const found = await this.prisma.raw.message.findMany({
				where: {
					conversationId: conversation.id,
					externalId: { in: candidates.map((m) => m.id) },
				},
				select: { externalId: true },
			});
			for (const row of found) {
				if (row.externalId) existingIds.add(row.externalId);
			}
		}

		let hasNewInbound = false;
		let hasNewMessage = false;
		for (const m of candidates) {
			if (existingIds.has(m.id)) continue;
			const createdAt = new Date(m.createdAt);

			// Buyer messages → INBOUND. Seller's own messages (whether sent
			// via CRM or directly from Allegro web/mobile) → OUTBOUND so the
			// thread shows both sides.
			let direction: 'INBOUND' | 'OUTBOUND';
			if (m.author.isInterlocutor === true) direction = 'INBOUND';
			else if (m.author.isInterlocutor === false) direction = 'OUTBOUND';
			else if (sellerId && m.author.id === sellerId) direction = 'OUTBOUND';
			else direction = 'INBOUND';

			const hasAttachments = (m.attachments ?? []).length > 0;
			const firstMime = m.attachments?.[0]?.mimeType ?? '';
			const contentType = hasAttachments
				? firstMime.startsWith('image/')
					? 'IMAGE'
					: 'FILE'
				: 'TEXT';

			const created = await this.prisma.raw.message.create({
				data: {
					conversationId: conversation.id,
					channelId,
					direction,
					contentType,
					body: decodeEntities(m.text),
					externalId: m.id,
					contactId,
					companyId,
					createdAt,
				},
				select: { id: true },
			});

			// Download any attachments and link them to the new Message.
			for (const att of m.attachments ?? []) {
				try {
					const dl = await this.provider.downloadAttachment(channelId, att.id);
					if (!dl) continue;
					const dirKey = `${channelId}/${conversation.id}`;
					const dirAbs = path.join(WEB_UPLOADS_DIR, dirKey);
					await mkdir(dirAbs, { recursive: true });
					const safeName = (
						att.fileName ?? dl.fileName ?? `allegro-${att.id}`
					).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
					const finalName = `${att.id.slice(0, 8)}-${safeName}`;
					const filePath = path.join(dirAbs, finalName);
					await writeFile(filePath, dl.buffer);
					const storageKey = `uploads/messaging/${dirKey}/${finalName}`;
					await this.prisma.raw.messageAttachment.create({
						data: {
							messageId: created.id,
							fileName: att.fileName ?? dl.fileName ?? safeName,
							mimeType: att.mimeType ?? dl.mimeType,
							fileSize: att.size ?? dl.buffer.length,
							storageKey,
							storageUrl: `/${storageKey}`,
						},
					});
				} catch (err) {
					this.logger.warn(
						`Allegro attachment ${att.id} save failed: ${err instanceof Error ? err.message : err}`,
					);
				}
			}

			hasNewMessage = true;
			if (direction === 'INBOUND') hasNewInbound = true;
			// Bridge to Web SSE so the open browser appends this single bubble
			// without refetching the whole thread. Bridge runs after we wrote
			// attachments so the resolved payload includes them.
			void this.webBridge.pushNewMessage(conversation.id, created.id);
		}

		// First message in this thread? Tell connected clients to prepend the
		// new conversation card to their list.
		if (isNewConversation && hasNewMessage) {
			void this.webBridge.pushNewConversation(conversation.id);
		}

		if (hasNewMessage) {
			await this.prisma.raw.conversation.update({
				where: { id: conversation.id },
				data: { lastMessageAt: new Date(thread.lastMessageDateTime) },
			});
			// Push to UI so the conversation list reorders and the open
			// thread re-fetches — fires for both buyer replies and seller
			// messages typed in Allegro web/mobile.
			await this.notifications.emitConversationUpdate(conversation.id, {
				lastMessageAt: thread.lastMessageDateTime,
			});
		}

		if (hasNewInbound) {
			// If the buyer is replying after we closed the thread, reopen it
			// (subject to the 4-hour manual-close grace window enforced by
			// transitionStatus). Only INBOUND should reopen — a seller-side
			// message must not undo a manual close.
			await this.statusService.transition({
				conversationId: conversation.id,
				toStatus: ConversationStatus.OPEN,
				actorUserId: null,
				reason: 'inbound-message',
				requireFromStatus: [
					ConversationStatus.NEW,
					ConversationStatus.WAITING_REPLY,
					ConversationStatus.RESOLVED,
					ConversationStatus.CLOSED,
				],
				respectManualCloseGrace: true,
			});
		}
	}

	/**
	 * If the conversation hasn't yet captured its Allegro offer, scan the
	 * fetched messages for the first one carrying `relatesTo.offer.id` and
	 * persist offer id + name (subject) + image + price. The actual product
	 * fetch is one extra `/sale/product-offers/{id}` call per thread, ever —
	 * once the row has `allegroOfferId` we skip both the scan and the fetch.
	 */
	private async maybePopulateAllegroOffer(
		channelId: string,
		conversationId: string,
		messages: Array<{
			subject?: string | null;
			relatesTo?: { offer?: { id: string } | null };
		}>,
	): Promise<void> {
		const existing = await this.prisma.raw.conversation.findUnique({
			where: { id: conversationId },
			select: { allegroOfferId: true },
		});
		if (!existing || existing.allegroOfferId) return;

		// Find first message that names the offer. Buyer inquiry usually puts
		// the offer name into `subject` on the *first* message of the thread.
		let offerId: string | null = null;
		let subject: string | null = null;
		for (const m of messages) {
			const id = m.relatesTo?.offer?.id;
			if (id && !offerId) offerId = id;
			if (!subject && m.subject && m.subject.trim()) subject = m.subject.trim();
			if (offerId && subject) break;
		}
		if (!offerId) return;

		const offer = await this.provider.getOffer(channelId, offerId);
		await this.prisma.raw.conversation.update({
			where: { id: conversationId },
			data: {
				allegroOfferId: offerId,
				allegroOfferImageUrl: offer?.imageUrl ?? null,
				allegroOfferPriceText: offer?.priceText ?? null,
				// Allegro polling never sets `subject`, so this only fires once
				// per thread and `subject` is null at this point.
				...(subject || offer?.name
					? { subject: subject ?? offer?.name }
					: {}),
			},
		});
	}
}
