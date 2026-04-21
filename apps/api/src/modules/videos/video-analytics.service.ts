import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAnalyticsData, SessionEndReason } from '@laptopguru-crm/shared';

@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullAnalytics(
    videoId: string,
    companyId: string | null,
    from: Date,
    to: Date,
  ): Promise<VideoAnalyticsData> {
    const video = await this.prisma.raw.video.findUnique({
      where: { id: videoId },
      select: { id: true, companyId: true, durationSeconds: true },
    });
    if (!video) throw new NotFoundException();
    if (companyId && video.companyId !== companyId) throw new NotFoundException();

    const durationSeconds = video.durationSeconds ?? 0;

    const [overview, retention, topPause, topSeek, timeSeries, recentSessions, breakdowns] =
      await Promise.all([
        this.getOverview(videoId, from, to),
        this.getRetention(videoId, durationSeconds),
        this.getTopSeconds(videoId, 'pauseCount'),
        this.getTopSeconds(videoId, 'seekAwayCount'),
        this.getTimeSeries(videoId, from, to),
        this.getRecentSessions(videoId, from, to),
        this.getBreakdowns(videoId, from, to),
      ]);

    return {
      overview,
      durationSeconds,
      retention,
      topSeekAwaySeconds: topSeek,
      topPauseSeconds: topPause,
      viewsTimeSeries: timeSeries,
      ...breakdowns,
      recentSessions,
    };
  }

  private async getOverview(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT
        COUNT(*)::int AS "sessionCount",
        COUNT(DISTINCT "landingVisitId")::int AS "uniqueViewers",
        COALESCE(SUM("durationWatchedMs"), 0)::int AS "totalWatchMs",
        COALESCE(AVG("durationWatchedMs"), 0)::float AS "avgWatchMs",
        COALESCE(AVG("completionPercent"), 0)::float AS "avgCompletion",
        COALESCE(SUM("errorCount"), 0)::int AS "errorCount"
      FROM "VideoPlaybackSession"
      WHERE "videoId" = ${videoId}
        AND "finalized" = true
        AND "startedAt" BETWEEN ${from} AND ${to}
    `) as {
      sessionCount: number;
      uniqueViewers: number;
      totalWatchMs: number;
      avgWatchMs: number;
      avgCompletion: number;
      errorCount: number;
    }[];

    const r = rows[0] ?? { sessionCount: 0, uniqueViewers: 0, totalWatchMs: 0, avgWatchMs: 0, avgCompletion: 0, errorCount: 0 };

    const landingVisits = (await this.prisma.raw.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "LandingVisit" v
      JOIN "Landing" l ON l.id = v."landingId"
      WHERE l."videoId" = ${videoId} AND v."visitedAt" BETWEEN ${from} AND ${to}
    `) as { c: number }[];
    const visits = landingVisits[0]?.c ?? 0;

    return {
      totalViews: r.sessionCount,
      uniqueViewers: r.uniqueViewers,
      totalWatchTime: Math.round(r.totalWatchMs / 1000),
      avgViewDuration: Math.round(r.avgWatchMs / 1000),
      completionRate: r.avgCompletion,
      playRate: visits > 0 ? r.sessionCount / visits : 0,
      errorCount: r.errorCount,
    };
  }

  private async getRetention(videoId: string, durationSeconds: number) {
    if (durationSeconds === 0) return [];
    // VideoSecondStats is keyed by (videoId, landingId, second) — this
    // service aggregates across every landing that uses the video, so we
    // SUM over landings per second.
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT "second", SUM("views")::int AS "views", SUM("replays")::int AS "replays"
      FROM "VideoSecondStats"
      WHERE "videoId" = ${videoId}
      GROUP BY "second"
      ORDER BY "second"
    `) as { second: number; views: number; replays: number }[];
    const bySecond = new Map(rows.map((r) => [r.second, r]));
    const base = rows[0]?.views ?? 0;
    return Array.from({ length: durationSeconds }, (_, s) => {
      const r = bySecond.get(s);
      return {
        second: s,
        views: r?.views ?? 0,
        replays: r?.replays ?? 0,
        viewersPercent: base > 0 ? (r?.views ?? 0) / base : 0,
      };
    });
  }

  private async getTopSeconds(videoId: string, col: 'pauseCount' | 'seekAwayCount') {
    // Two query variants so we never interpolate a raw identifier — avoids any
    // risk of SQL injection and keeps Prisma's parameterization happy.
    const rows =
      col === 'pauseCount'
        ? ((await this.prisma.raw.$queryRaw`
            SELECT "second", SUM("pauseCount")::int AS c
            FROM "VideoSecondStats"
            WHERE "videoId" = ${videoId}
            GROUP BY "second"
            HAVING SUM("pauseCount") > 0
            ORDER BY c DESC
            LIMIT 5
          `) as { second: number; c: number }[])
        : ((await this.prisma.raw.$queryRaw`
            SELECT "second", SUM("seekAwayCount")::int AS c
            FROM "VideoSecondStats"
            WHERE "videoId" = ${videoId}
            GROUP BY "second"
            HAVING SUM("seekAwayCount") > 0
            ORDER BY c DESC
            LIMIT 5
          `) as { second: number; c: number }[]);
    return rows.map((r) => ({ second: r.second, count: Number(r.c) }));
  }

  private async getTimeSeries(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT DATE("startedAt") AS date, COUNT(*)::int AS views
      FROM "VideoPlaybackSession"
      WHERE "videoId" = ${videoId}
        AND "finalized" = true
        AND "startedAt" BETWEEN ${from} AND ${to}
      GROUP BY DATE("startedAt")
      ORDER BY date
    `) as { date: Date; views: number }[];
    return rows.map((r) => ({ date: r.date.toISOString().split('T')[0], views: r.views }));
  }

  private async getRecentSessions(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT
        s."id" AS "sessionId",
        s."landingVisitId" AS "visitId",
        s."startedAt",
        s."durationWatchedMs",
        s."completionPercent",
        s."endReason",
        v."country",
        v."deviceType",
        v."browser"
      FROM "VideoPlaybackSession" s
      LEFT JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId}
        AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to}
      ORDER BY s."startedAt" DESC
      LIMIT 50
    `) as {
      sessionId: string;
      visitId: string;
      startedAt: Date;
      durationWatchedMs: number;
      completionPercent: number;
      endReason: SessionEndReason | null;
      country: string | null;
      deviceType: string | null;
      browser: string | null;
    }[];
    return rows.map((r) => ({
      sessionId: r.sessionId,
      visitId: r.visitId,
      startedAt: r.startedAt.toISOString(),
      durationWatchedMs: r.durationWatchedMs,
      completionPercent: r.completionPercent,
      endReason: r.endReason,
      country: r.country,
      device: r.deviceType,
      browser: r.browser,
    }));
  }

  private async getBreakdowns(videoId: string, from: Date, to: Date) {
    const [geoRows, devRows, browRows, osRows, refRows] = await Promise.all([
      this.prisma.raw.$queryRaw`
        SELECT v."country" AS k, COUNT(DISTINCT s.id)::int AS c
        FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
        WHERE s."videoId" = ${videoId} AND s."finalized" = true
          AND s."startedAt" BETWEEN ${from} AND ${to} AND v."country" IS NOT NULL
        GROUP BY v."country" ORDER BY c DESC LIMIT 15
      ` as Promise<{ k: string; c: number }[]>,
      this.prisma.raw.$queryRaw`
        SELECT v."deviceType" AS k, COUNT(DISTINCT s.id)::int AS c
        FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
        WHERE s."videoId" = ${videoId} AND s."finalized" = true
          AND s."startedAt" BETWEEN ${from} AND ${to} AND v."deviceType" IS NOT NULL
        GROUP BY v."deviceType" ORDER BY c DESC
      ` as Promise<{ k: string; c: number }[]>,
      this.prisma.raw.$queryRaw`
        SELECT v."browser" AS k, COUNT(DISTINCT s.id)::int AS c
        FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
        WHERE s."videoId" = ${videoId} AND s."finalized" = true
          AND s."startedAt" BETWEEN ${from} AND ${to} AND v."browser" IS NOT NULL
        GROUP BY v."browser" ORDER BY c DESC LIMIT 15
      ` as Promise<{ k: string; c: number }[]>,
      this.prisma.raw.$queryRaw`
        SELECT v."os" AS k, COUNT(DISTINCT s.id)::int AS c
        FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
        WHERE s."videoId" = ${videoId} AND s."finalized" = true
          AND s."startedAt" BETWEEN ${from} AND ${to} AND v."os" IS NOT NULL
        GROUP BY v."os" ORDER BY c DESC LIMIT 15
      ` as Promise<{ k: string; c: number }[]>,
      this.prisma.raw.$queryRaw`
        SELECT v."referrerDomain" AS k, COUNT(DISTINCT s.id)::int AS c
        FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
        WHERE s."videoId" = ${videoId} AND s."finalized" = true
          AND s."startedAt" BETWEEN ${from} AND ${to} AND v."referrerDomain" IS NOT NULL
        GROUP BY v."referrerDomain" ORDER BY c DESC LIMIT 15
      ` as Promise<{ k: string; c: number }[]>,
    ]);

    return {
      geography: geoRows.map((r) => ({ country: r.k, views: r.c })),
      devices: devRows.map((r) => ({ deviceType: r.k, views: r.c })),
      browsers: browRows.map((r) => ({ browser: r.k, views: r.c })),
      os: osRows.map((r) => ({ os: r.k, views: r.c })),
      referrers: refRows.map((r) => ({ referrerDomain: r.k, views: r.c })),
    };
  }
}
