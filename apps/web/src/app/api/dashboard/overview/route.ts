import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@laptopguru-crm/shared';

const startOfDay = (d = new Date()) => {
	const dt = new Date(d);
	dt.setHours(0, 0, 0, 0);
	return dt;
};

const daysAgo = (n: number) => {
	const dt = new Date();
	dt.setDate(dt.getDate() - n);
	return dt;
};

/**
 * Single overview endpoint for the dashboard. Picks the cheaper aggregations
 * (counts + tiny LIMITed lists) so it stays under one round-trip.
 */
export async function GET() {
	const { session, error } = await authorize(PERMISSIONS.DASHBOARD_READ);
	if (error) return error;
	const companyId = session.user.companyId ?? '';
	const today = startOfDay();
	const weekAgo = daysAgo(7);

	const [
		openCount,
		newTodayCount,
		resolvedTodayCount,
		urgentCount,
		assignedToMeCount,
		channelsRaw,
		recentConversations,
		recentLandings,
		landingTotals,
		visitTotals,
	] = await Promise.all([
		prisma.conversation.count({
			where: { companyId, status: { in: ['NEW', 'OPEN', 'WAITING_REPLY'] } },
		}),
		prisma.conversation.count({
			where: { companyId, createdAt: { gte: today } },
		}),
		prisma.conversation.count({
			where: {
				companyId,
				status: 'RESOLVED',
				lastStatusChangedAt: { gte: today },
			},
		}),
		prisma.conversation.count({
			where: { companyId, priority: { in: ['HIGH', 'URGENT'] }, status: { not: 'RESOLVED' } },
		}),
		prisma.conversation.count({
			where: {
				companyId,
				assignments: { some: { userId: session.user!.id, isActive: true } },
				status: { not: 'RESOLVED' },
			},
		}),
		prisma.channel.findMany({
			where: { companyId, isActive: true },
			select: {
				id: true,
				name: true,
				type: true,
				_count: {
					select: {
						conversations: {
							where: { status: { in: ['NEW', 'OPEN', 'WAITING_REPLY'] } },
						},
					},
				},
			},
		}),
		prisma.conversation.findMany({
			where: { companyId },
			orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
			take: 8,
			include: {
				contact: { select: { id: true, displayName: true, avatarUrl: true } },
				channel: { select: { id: true, name: true, type: true } },
				messages: {
					orderBy: { createdAt: 'desc' },
					take: 1,
					select: { body: true },
				},
			},
		}),
		prisma.landing.findMany({
			where: { companyId, createdAt: { gte: weekAgo } },
			orderBy: { createdAt: 'desc' },
			take: 5,
			select: {
				id: true,
				slug: true,
				title: true,
				createdAt: true,
				clicks: true,
				language: true,
				video: { select: { thumbnail: true, title: true } },
				_count: { select: { visits: true } },
			},
		}),
		prisma.landing.aggregate({
			where: { companyId, createdAt: { gte: weekAgo } },
			_count: { _all: true },
			_sum: { clicks: true },
		}),
		prisma.landingVisit.count({
			where: { companyId, visitedAt: { gte: weekAgo } },
		}),
	]);

	return NextResponse.json({
		messaging: {
			openCount,
			newTodayCount,
			resolvedTodayCount,
			urgentCount,
			assignedToMeCount,
		},
		channels: channelsRaw.map((c) => ({
			id: c.id,
			name: c.name,
			type: c.type,
			openCount: c._count.conversations,
		})),
		recentConversations: recentConversations.map((c) => ({
			id: c.id,
			status: c.status,
			subject: c.subject,
			lastMessageAt: c.lastMessageAt,
			lastMessagePreview: (c.messages[0]?.body ?? '').slice(0, 140),
			channel: c.channel,
			contact: c.contact
				? {
						id: c.contact.id,
						name: c.contact.displayName,
						avatarUrl: c.contact.avatarUrl,
					}
				: null,
		})),
		landings: {
			recent: recentLandings.map((l) => ({
				id: l.id,
				slug: l.slug,
				title: l.title,
				language: l.language,
				createdAt: l.createdAt,
				clicks: l.clicks,
				views: l._count.visits,
				thumbnail: l.video.thumbnail,
				videoTitle: l.video.title,
			})),
			weekTotals: {
				count: landingTotals._count._all,
				clicks: landingTotals._sum.clicks ?? 0,
				visits: visitTotals,
			},
		},
	});
}
