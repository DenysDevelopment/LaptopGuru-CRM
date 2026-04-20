import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { PERMISSIONS, type VideoAnalyticsData, type SessionEndReason } from '@laptopguru-crm/shared';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: 'No company assigned' }, { status: 403 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({
    where: { id },
    select: { id: true, companyId: true, durationSeconds: true },
  });
  if (!video || video.companyId !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const durationSeconds = video.durationSeconds ?? 0;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const landingId = url.searchParams.get('landingId');
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const toDate = to ? new Date(to) : new Date();

  // If landingId passed, scope ALL session queries to visits of that landing
  // only. Otherwise aggregate across every landing that uses this video.
  const sessionScope = landingId
    ? Prisma.sql`
        s."videoId" = ${id}
        AND s."finalized" = true
        AND s."startedAt" BETWEEN ${fromDate} AND ${toDate}
        AND s."landingVisitId" IN (
          SELECT id FROM "LandingVisit" WHERE "landingId" = ${landingId}
        )
      `
    : Prisma.sql`
        s."videoId" = ${id}
        AND s."finalized" = true
        AND s."startedAt" BETWEEN ${fromDate} AND ${toDate}
      `;

  const visitsScope = landingId
    ? Prisma.sql`v."landingId" = ${landingId}`
    : Prisma.sql`l."videoId" = ${id}`;

  const [
    overviewRows,
    visitsCountRows,
    retentionRows,
    topPauseRows,
    topSeekRows,
    timeSeriesRows,
    recentRows,
    geoRows,
    devRows,
    browRows,
    osRows,
    refRows,
  ] = await Promise.all([
    prisma.$queryRaw<{
      sessionCount: number;
      uniqueViewers: number;
      totalWatchMs: number;
      avgWatchMs: number;
      avgCompletion: number;
      errorCount: number;
    }[]>`
      SELECT
        COUNT(*)::int AS "sessionCount",
        COUNT(DISTINCT s."landingVisitId")::int AS "uniqueViewers",
        COALESCE(SUM(s."durationWatchedMs"), 0)::int AS "totalWatchMs",
        COALESCE(AVG(s."durationWatchedMs"), 0)::float AS "avgWatchMs",
        COALESCE(AVG(s."completionPercent"), 0)::float AS "avgCompletion",
        COALESCE(SUM(s."errorCount"), 0)::int AS "errorCount"
      FROM "VideoPlaybackSession" s
      WHERE ${sessionScope}
    `,
    prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM "LandingVisit" v
      JOIN "Landing" l ON l.id = v."landingId"
      WHERE ${visitsScope}
        AND v."visitedAt" BETWEEN ${fromDate} AND ${toDate}
    `,
    prisma.$queryRaw<{ second: number; views: number; replays: number }[]>`
      SELECT "second", "views", "replays"
      FROM "VideoSecondStats" WHERE "videoId" = ${id} ORDER BY "second"
    `,
    prisma.$queryRaw<{ second: number; c: number }[]>`
      SELECT "second", "pauseCount" AS c
      FROM "VideoSecondStats"
      WHERE "videoId" = ${id} AND "pauseCount" > 0
      ORDER BY "pauseCount" DESC LIMIT 5
    `,
    prisma.$queryRaw<{ second: number; c: number }[]>`
      SELECT "second", "seekAwayCount" AS c
      FROM "VideoSecondStats"
      WHERE "videoId" = ${id} AND "seekAwayCount" > 0
      ORDER BY "seekAwayCount" DESC LIMIT 5
    `,
    prisma.$queryRaw<{ date: Date; views: number }[]>`
      SELECT DATE(s."startedAt") AS date, COUNT(*)::int AS views
      FROM "VideoPlaybackSession" s
      WHERE ${sessionScope}
      GROUP BY DATE(s."startedAt") ORDER BY date
    `,
    prisma.$queryRaw<{
      sessionId: string;
      visitId: string;
      startedAt: Date;
      durationWatchedMs: number;
      completionPercent: number;
      endReason: SessionEndReason | null;
      country: string | null;
      deviceType: string | null;
      browser: string | null;
    }[]>`
      SELECT s."id" AS "sessionId", s."landingVisitId" AS "visitId", s."startedAt",
             s."durationWatchedMs", s."completionPercent", s."endReason",
             v."country", v."deviceType", v."browser"
      FROM "VideoPlaybackSession" s
      LEFT JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope}
      ORDER BY s."startedAt" DESC LIMIT 50
    `,
    prisma.$queryRaw<{ k: string; c: number }[]>`
      SELECT v."country" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope} AND v."country" IS NOT NULL
      GROUP BY v."country" ORDER BY c DESC LIMIT 15
    `,
    prisma.$queryRaw<{ k: string; c: number }[]>`
      SELECT v."deviceType" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope} AND v."deviceType" IS NOT NULL
      GROUP BY v."deviceType" ORDER BY c DESC
    `,
    prisma.$queryRaw<{ k: string; c: number }[]>`
      SELECT v."browser" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope} AND v."browser" IS NOT NULL
      GROUP BY v."browser" ORDER BY c DESC LIMIT 15
    `,
    prisma.$queryRaw<{ k: string; c: number }[]>`
      SELECT v."os" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope} AND v."os" IS NOT NULL
      GROUP BY v."os" ORDER BY c DESC LIMIT 15
    `,
    prisma.$queryRaw<{ k: string; c: number }[]>`
      SELECT v."referrerDomain" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE ${sessionScope} AND v."referrerDomain" IS NOT NULL
      GROUP BY v."referrerDomain" ORDER BY c DESC LIMIT 15
    `,
  ]);

  const ov = overviewRows[0] ?? {
    sessionCount: 0,
    uniqueViewers: 0,
    totalWatchMs: 0,
    avgWatchMs: 0,
    avgCompletion: 0,
    errorCount: 0,
  };
  const visits = visitsCountRows[0]?.c ?? 0;

  const retBySec = new Map(retentionRows.map(r => [r.second, r]));
  const retBase = retentionRows[0]?.views ?? 0;
  const retention = Array.from({ length: durationSeconds }, (_, s) => {
    const r = retBySec.get(s);
    return {
      second: s,
      views: r?.views ?? 0,
      replays: r?.replays ?? 0,
      viewersPercent: retBase > 0 ? (r?.views ?? 0) / retBase : 0,
    };
  });

  // playRate = доля визитов, которые хотя бы раз нажали play. Clamp to 100% —
  // если uniqueViewers > visits (редкая гонка при старых данных), не показываем
  // «133%».
  const playRate = visits > 0 ? Math.min(1, ov.uniqueViewers / visits) : 0;

  const data: VideoAnalyticsData = {
    overview: {
      totalViews: ov.sessionCount,
      uniqueViewers: ov.uniqueViewers,
      totalWatchTime: Math.round(ov.totalWatchMs / 1000),
      avgViewDuration: Math.round(ov.avgWatchMs / 1000),
      completionRate: ov.avgCompletion,
      playRate,
      errorCount: ov.errorCount,
    },
    durationSeconds,
    retention,
    topSeekAwaySeconds: topSeekRows.map(r => ({ second: r.second, count: Number(r.c) })),
    topPauseSeconds: topPauseRows.map(r => ({ second: r.second, count: Number(r.c) })),
    viewsTimeSeries: timeSeriesRows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      views: Number(r.views),
    })),
    geography: geoRows.map(r => ({ country: r.k, views: r.c })),
    devices: devRows.map(r => ({ deviceType: r.k, views: r.c })),
    browsers: browRows.map(r => ({ browser: r.k, views: r.c })),
    os: osRows.map(r => ({ os: r.k, views: r.c })),
    referrers: refRows.map(r => ({ referrerDomain: r.k, views: r.c })),
    recentSessions: recentRows.map(r => ({
      sessionId: r.sessionId,
      visitId: r.visitId,
      startedAt: r.startedAt.toISOString(),
      durationWatchedMs: r.durationWatchedMs,
      completionPercent: r.completionPercent,
      endReason: r.endReason,
      country: r.country,
      device: r.deviceType,
      browser: r.browser,
    })),
  };

  return NextResponse.json(data);
}
