import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAnalyticsData } from '@laptopguru-crm/shared';

type SessionRow = {
  id: string;
  landingVisitId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationWatchedMs: number | null;
  completionPercent: number | null;
  endReason: string | null;
  errorCount: number | null;
  visit: {
    country: string | null;
    deviceType: string | null;
    browser: string | null;
    referrerDomain: string | null;
    sessionId: string | null;
    landing: { slug: string };
  };
};

type SecondStatsRow = {
  second: number;
  views: number;
  replays: number;
  pauseCount: number;
  seekAwayCount: number;
};

@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    videoId: string,
    companyId: string,
    from?: Date,
    to?: Date,
  ): Promise<VideoAnalyticsData> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, companyId },
      select: { id: true, durationSeconds: true },
    });
    if (!video) throw new NotFoundException('video not found');

    const sessionWhere = {
      videoId,
      companyId,
      finalized: true,
      ...(from || to ? { startedAt: { gte: from, lte: to } } : {}),
    };

    const [sessions, secondStats] = await Promise.all([
      this.prisma.videoPlaybackSession.findMany({
        where: sessionWhere,
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          landingVisitId: true,
          startedAt: true,
          endedAt: true,
          durationWatchedMs: true,
          completionPercent: true,
          endReason: true,
          errorCount: true,
          visit: {
            select: {
              country: true,
              deviceType: true,
              browser: true,
              referrerDomain: true,
              sessionId: true,
              landing: { select: { slug: true } },
            },
          },
        },
      }) as unknown as Promise<SessionRow[]>,
      this.prisma.videoSecondStats.findMany({
        where: { videoId },
        orderBy: { second: 'asc' },
      }) as unknown as Promise<SecondStatsRow[]>,
    ]);

    const totalSessions = sessions.length;
    const uniqueVisitors = new Set(sessions.map((s) => s.visit.sessionId)).size;
    const avgWatchTimeMs = totalSessions
      ? Math.round(sessions.reduce((a, s) => a + (s.durationWatchedMs ?? 0), 0) / totalSessions)
      : 0;
    const completionRate = totalSessions
      ? sessions.filter((s) => (s.completionPercent ?? 0) >= 0.95).length / totalSessions
      : 0;
    const errorCount = sessions.reduce((a, s) => a + (s.errorCount ?? 0), 0);

    const countBy = (key: 'deviceType' | 'browser' | 'country' | 'referrerDomain') => {
      const map = new Map<string, number>();
      for (const s of sessions) {
        const v = (s.visit[key] as string | null) ?? 'unknown';
        map.set(v, (map.get(v) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([k, n]) => ({ key: k, sessions: n }))
        .sort((a, b) => b.sessions - a.sessions);
    };

    return {
      overview: {
        sessions: totalSessions,
        uniqueVisitors,
        avgWatchTimeMs,
        completionRate,
        errorCount,
      },
      retention: secondStats.map((r) => ({
        second: r.second,
        views: r.views,
        replays: r.replays,
        pauseCount: r.pauseCount,
        seekAwayCount: r.seekAwayCount,
      })),
      devices: countBy('deviceType').map((x) => ({ deviceType: x.key, sessions: x.sessions })),
      browsers: countBy('browser').map((x) => ({ browser: x.key, sessions: x.sessions })),
      geography: countBy('country').map((x) => ({ country: x.key, sessions: x.sessions })),
      referrers: countBy('referrerDomain').map((x) => ({ referrerDomain: x.key, sessions: x.sessions })),
      recentSessions: sessions.slice(0, 50).map((s) => ({
        id: s.id,
        visitId: s.landingVisitId,
        landingSlug: s.visit.landing.slug,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationWatchedMs: s.durationWatchedMs ?? 0,
        completionPercent: s.completionPercent ?? 0,
        endReason: String(s.endReason ?? 'INCOMPLETE'),
        country: s.visit.country,
        deviceType: s.visit.deviceType,
        browser: s.visit.browser,
      })),
    };
  }
}
