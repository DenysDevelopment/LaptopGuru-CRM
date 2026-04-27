import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { AllegroProviderService } from '../providers/allegro/allegro-provider.service';
import { AllegroOAuthService } from '../providers/allegro/allegro-oauth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationStatusService } from '../conversations/status.service';
import { ConversationStatus } from '../../../generated/prisma/client';

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
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async run(): Promise<void> {
		const channels = await this.prisma.raw.channel.findMany({
			where: { type: 'ALLEGRO', isActive: true },
			select: { id: true, companyId: true },
		});
		if (channels.length === 0) return;

		for (const channel of channels) {
			try {
				await this.pollChannel(channel.id, channel.companyId);
			} catch (err) {
				this.logger.warn(
					`Allegro poll failed for channel ${channel.id}: ${err instanceof Error ? err.message : err}`,
				);
			}
		}
	}

	private async pollChannel(channelId: string, companyId: string): Promise<void> {
		const cfg = await this.oauth.loadConfig(channelId);
		if (!cfg.get('oauth_access_token')) return; // not authorized yet

		const lastPollStr = cfg.get('last_poll_at');
		const lastPoll = lastPollStr ? new Date(lastPollStr) : new Date(0);
		const sellerId = cfg.get('seller_id') ?? null;

		// Pull recent threads (newest first); stop when older than cursor.
		const { threads } = await this.provider.listThreads(channelId, {
			limit: 50,
			offset: 0,
		});

		let newest = lastPoll;
		for (const t of threads) {
			const lastMsgAt = new Date(t.lastMessageDateTime);
			if (lastMsgAt > newest) newest = lastMsgAt;
			if (lastMsgAt <= lastPoll) continue; // already ingested

			await this.ingestThread(channelId, companyId, t, sellerId, lastPoll);
		}

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
			interlocutor: { id: string; login: string };
		},
		sellerId: string | null,
		cursor: Date,
	): Promise<void> {
		// Find or create Contact + ContactChannel for this Allegro buyer.
		let contactChannel = await this.prisma.raw.contactChannel.findFirst({
			where: {
				companyId,
				channelType: 'ALLEGRO',
				identifier: thread.interlocutor.id,
			},
		});
		let contactId: string;
		if (contactChannel) {
			contactId = contactChannel.contactId;
		} else {
			const contact = await this.prisma.raw.contact.create({
				data: {
					displayName: thread.interlocutor.login,
					companyId,
				},
			});
			contactId = contact.id;
			contactChannel = await this.prisma.raw.contactChannel.create({
				data: {
					contactId,
					channelType: 'ALLEGRO',
					identifier: thread.interlocutor.id,
					companyId,
				},
			});
		}

		// Find or create Conversation by externalId=thread.id
		let conversation = await this.prisma.raw.conversation.findFirst({
			where: { channelId, externalId: thread.id },
			select: { id: true, status: true },
		});
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
		}

		// Pull messages newer than cursor; Allegro returns them oldest first.
		const { messages } = await this.provider.listMessages(channelId, thread.id, {
			limit: 50,
		});

		let hasNewInbound = false;
		for (const m of messages) {
			const createdAt = new Date(m.createdAt);
			if (createdAt <= cursor) continue;
			// Skip echoes of our own outbound — by author id matching seller_id.
			if (sellerId && m.author.id === sellerId) continue;

			const exists = await this.prisma.raw.message.findFirst({
				where: { conversationId: conversation.id, externalId: m.id },
				select: { id: true },
			});
			if (exists) continue;

			await this.prisma.raw.message.create({
				data: {
					conversationId: conversation.id,
					channelId,
					direction: 'INBOUND',
					contentType: 'TEXT',
					body: m.text,
					externalId: m.id,
					contactId,
					companyId,
					createdAt,
				},
			});
			hasNewInbound = true;
		}

		if (hasNewInbound) {
			await this.prisma.raw.conversation.update({
				where: { id: conversation.id },
				data: { lastMessageAt: new Date(thread.lastMessageDateTime) },
			});
			// If the buyer is replying after we closed the thread, reopen it
			// (subject to the 4-hour manual-close grace window enforced by
			// transitionStatus).
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
			// Push to UI
			await this.notifications.emitConversationUpdate(conversation.id, {
				lastMessageAt: thread.lastMessageDateTime,
			});
		}
	}
}
