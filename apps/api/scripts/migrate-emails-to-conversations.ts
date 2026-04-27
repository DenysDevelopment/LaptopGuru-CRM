/**
 * One-time migration: every IncomingEmail without a linked Conversation gets
 * one created for it under the company's earliest active EMAIL channel,
 * with the status mapped from processed/archived flags. Each Landing wired
 * to the email becomes an OUTBOUND Message + LANDING_SENT event in the
 * conversation timeline.
 *
 * Idempotent. Safe to re-run. Use `--dry-run` to inspect without writing.
 *
 *   npx tsx apps/api/scripts/migrate-emails-to-conversations.ts --dry-run
 *   npx tsx apps/api/scripts/migrate-emails-to-conversations.ts
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

interface Stats {
	companies: number;
	emails: number;
	conversationsCreated: number;
	messagesCreated: number;
	eventsCreated: number;
	skippedNoEmailChannel: number;
	skippedAlreadyLinked: number;
	skippedNoCustomerEmail: number;
}

async function main() {
	const stats: Stats = {
		companies: 0,
		emails: 0,
		conversationsCreated: 0,
		messagesCreated: 0,
		eventsCreated: 0,
		skippedNoEmailChannel: 0,
		skippedAlreadyLinked: 0,
		skippedNoCustomerEmail: 0,
	};

	const companies = await prisma.company.findMany({
		select: { id: true, name: true },
	});
	stats.companies = companies.length;
	console.log(`Found ${companies.length} companies.\n`);

	for (const company of companies) {
		console.log(`[${company.name}]`);
		const emailChannel = await prisma.channel.findFirst({
			where: { companyId: company.id, type: 'EMAIL', isActive: true },
			orderBy: { createdAt: 'asc' },
		});
		if (!emailChannel) {
			console.log('  ⚠ no active EMAIL channel — skipping all emails');
		}

		const emails = await prisma.incomingEmail.findMany({
			where: { companyId: company.id },
			include: {
				landings: {
					include: {
						video: { select: { title: true, thumbnail: true } },
						sentEmails: { take: 1, orderBy: { createdAt: 'asc' } },
						shortLinks: { take: 1, orderBy: { createdAt: 'asc' } },
					},
				},
			},
		});

		for (const email of emails) {
			stats.emails++;

			if (!email.customerEmail) {
				stats.skippedNoCustomerEmail++;
				continue;
			}
			if (!emailChannel) {
				stats.skippedNoEmailChannel++;
				continue;
			}

			const existing = await prisma.conversation.findUnique({
				where: { incomingEmailId: email.id },
				select: { id: true },
			});
			if (existing) {
				stats.skippedAlreadyLinked++;
				continue;
			}

			const targetStatus =
				email.archived
					? 'RESOLVED'
					: email.processed
						? email.landings.length > 0
							? 'WAITING_REPLY'
							: 'OPEN'
						: 'NEW';

			if (dryRun) {
				console.log(
					`  + ${email.id} (${email.customerEmail}) → ${targetStatus} with ${email.landings.length} landing(s)`,
				);
				stats.conversationsCreated++;
				stats.messagesCreated++;
				stats.messagesCreated += email.landings.length;
				stats.eventsCreated += email.landings.length;
				continue;
			}

			// Find or create Contact via ContactChannel
			let contactChannel = await prisma.contactChannel.findFirst({
				where: {
					companyId: company.id,
					channelType: 'EMAIL',
					identifier: email.customerEmail,
				},
			});
			let contactId: string;
			if (contactChannel) {
				contactId = contactChannel.contactId;
			} else {
				const contact = await prisma.contact.create({
					data: {
						displayName:
							email.customerName ||
							email.customerEmail.split('@')[0] ||
							'Без имени',
						companyId: company.id,
					},
				});
				contactId = contact.id;
				contactChannel = await prisma.contactChannel.create({
					data: {
						contactId,
						channelType: 'EMAIL',
						identifier: email.customerEmail,
						companyId: company.id,
					},
				});
			}

			const conversation = await prisma.conversation.create({
				data: {
					contactId,
					channelId: emailChannel.id,
					subject: email.subject || null,
					externalId: email.messageId,
					status: targetStatus,
					lastMessageAt: email.receivedAt,
					closedAt: targetStatus === 'RESOLVED' ? email.updatedAt : null,
					incomingEmailId: email.id,
					companyId: company.id,
				},
			});
			stats.conversationsCreated++;

			await prisma.message.create({
				data: {
					conversationId: conversation.id,
					channelId: emailChannel.id,
					direction: 'INBOUND',
					contentType: 'TEXT',
					body: email.body,
					externalId: email.messageId,
					contactId,
					companyId: company.id,
					createdAt: email.receivedAt,
				},
			});
			stats.messagesCreated++;

			// For each Landing tied to this email — outbound message + event
			for (const landing of email.landings) {
				const sent = landing.sentEmails[0];
				const shortLink = landing.shortLinks[0];
				const sentAt = sent?.createdAt ?? landing.createdAt;
				const shortUrl = shortLink
					? `${process.env.APP_URL ?? 'http://localhost:3000'}/r/${shortLink.code}`
					: `${process.env.APP_URL ?? 'http://localhost:3000'}/l/${landing.slug}`;

				const message = await prisma.message.create({
					data: {
						conversationId: conversation.id,
						channelId: emailChannel.id,
						direction: 'OUTBOUND',
						contentType: 'TEXT',
						body: `Видео-рецензия отправлена: ${landing.video.title}\n${shortUrl}`,
						metadata: {
							eventType: 'LANDING_SENT',
							landingId: landing.id,
						},
						senderId: landing.userId,
						contactId,
						companyId: company.id,
						createdAt: sentAt,
					},
				});
				stats.messagesCreated++;

				await prisma.conversationEvent.create({
					data: {
						conversationId: conversation.id,
						type: 'LANDING_SENT',
						actorUserId: landing.userId,
						payload: {
							landingId: landing.id,
							slug: landing.slug,
							videoId: landing.videoId,
							videoTitle: landing.video.title,
							videoThumbnail: landing.video.thumbnail,
							shortUrl,
							messageId: message.id,
						},
						companyId: company.id,
						createdAt: sentAt,
					},
				});
				stats.eventsCreated++;
			}
		}
	}

	console.log('\n=== Summary ===');
	console.log(JSON.stringify(stats, null, 2));
	console.log(dryRun ? '(dry-run — nothing written)' : '(committed)');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
