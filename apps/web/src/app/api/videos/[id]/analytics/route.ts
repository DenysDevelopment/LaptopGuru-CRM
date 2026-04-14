import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (video.source !== "S3") {
    return NextResponse.json(
      { error: "Detailed analytics available only for S3 videos" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const landingId = url.searchParams.get("landingId");
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const toDate = to ? new Date(to) : new Date();

  // All landing visits — scoped to specific landing if provided, otherwise all landings with this video
  const allVisits = await prisma.landingVisit.findMany({
    where: {
      ...(landingId ? { landingId } : { landing: { videoId: id } }),
      visitedAt: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      visitedAt: true,
      videoPlayed: true,
      videoWatchTime: true,
      videoCompleted: true,
      country: true,
      deviceType: true,
      browser: true,
    },
  });

  const landingVisits = allVisits.length;

  // Visit IDs for scoping SQL queries when filtering by landing
  const visitIds = allVisits.map((v) => v.id);

  // Check if we have detailed events
  const eventCount = landingId
    ? await prisma.videoWatchEvent.count({
        where: { videoId: id, landingVisitId: { in: visitIds } },
      })
    : await prisma.videoWatchEvent.count({
        where: { videoId: id, serverTimestamp: { gte: fromDate, lte: toDate } },
      });

  let views: number;
  let totalWatchTime: number;
  let completedCount: number;
  let uniqueViewers: number;
  let retention: { second: number; viewers: number; viewersPercent: number }[] = [];
  let timeSeriesData: { date: string; views: number }[] = [];

  if (eventCount > 0) {
    // --- Detailed analytics from VideoWatchEvent (segment aggregation) ---
    // A PLAY or HEARTBEAT row "opens" a segment closed by the next event for the
    // same visit. Sum (nextPos - pos) across consecutive pairs, clamped to [0, 600].
    // Matches apps/api/src/modules/videos/video-analytics.service.ts — keep in sync.
    type WatchRow = { landingVisitId: string; totalWatch: number | bigint; completed: boolean };
    const watchRows = landingId
      ? await prisma.$queryRaw<WatchRow[]>`
          WITH ordered AS (
            SELECT
              "landingVisitId", "eventType", "position",
              LEAD("eventType") OVER w AS next_type,
              LEAD("position")  OVER w AS next_pos
            FROM "VideoWatchEvent"
            WHERE "videoId" = ${id}
              AND "landingVisitId" = ANY(${visitIds}::text[])
              AND "eventType" IN ('PLAY','PAUSE','SEEK','ENDED','HEARTBEAT')
            WINDOW w AS (PARTITION BY "landingVisitId" ORDER BY "serverTimestamp", "id")
          )
          SELECT
            "landingVisitId",
            COALESCE(SUM(
              CASE
                WHEN "eventType" = 'PLAY' AND next_type IN ('PAUSE','ENDED','SEEK','HEARTBEAT')
                  THEN GREATEST(0, LEAST(next_pos - "position", 600))
                WHEN "eventType" = 'HEARTBEAT' AND next_type IN ('HEARTBEAT','PAUSE','ENDED')
                  THEN GREATEST(0, LEAST(next_pos - "position", 600))
                ELSE 0
              END
            ), 0)::float AS "totalWatch",
            BOOL_OR("eventType" = 'ENDED') AS completed
          FROM ordered
          GROUP BY "landingVisitId"`
      : await prisma.$queryRaw<WatchRow[]>`
          WITH ordered AS (
            SELECT
              "landingVisitId", "eventType", "position",
              LEAD("eventType") OVER w AS next_type,
              LEAD("position")  OVER w AS next_pos
            FROM "VideoWatchEvent"
            WHERE "videoId" = ${id}
              AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
              AND "eventType" IN ('PLAY','PAUSE','SEEK','ENDED','HEARTBEAT')
            WINDOW w AS (PARTITION BY "landingVisitId" ORDER BY "serverTimestamp", "id")
          )
          SELECT
            "landingVisitId",
            COALESCE(SUM(
              CASE
                WHEN "eventType" = 'PLAY' AND next_type IN ('PAUSE','ENDED','SEEK','HEARTBEAT')
                  THEN GREATEST(0, LEAST(next_pos - "position", 600))
                WHEN "eventType" = 'HEARTBEAT' AND next_type IN ('HEARTBEAT','PAUSE','ENDED')
                  THEN GREATEST(0, LEAST(next_pos - "position", 600))
                ELSE 0
              END
            ), 0)::float AS "totalWatch",
            BOOL_OR("eventType" = 'ENDED') AS completed
          FROM ordered
          GROUP BY "landingVisitId"`;

    // No minimum-watch threshold: any visit with a play counts as a view so that
    // short test plays and legit-but-brief impressions still render in the UI.
    views = watchRows.length;
    totalWatchTime = watchRows.reduce((sum, r) => sum + Number(r.totalWatch), 0);
    completedCount = watchRows.filter((r) => r.completed).length;
    uniqueViewers = watchRows.length;

    // Retention curve
    const totalSeconds = video.durationSeconds ?? 0;
    const bucketSize = 5;
    const buckets = totalSeconds > 0 ? Math.ceil(totalSeconds / bucketSize) : 0;
    if (buckets > 0) {
      const retRows = landingId
        ? await prisma.$queryRaw<{ bucket: number; viewers: bigint }[]>`
            SELECT FLOOR(position / ${bucketSize})::int AS bucket, COUNT(DISTINCT "landingVisitId") AS viewers
            FROM "VideoWatchEvent"
            WHERE "videoId" = ${id} AND "eventType" IN ('HEARTBEAT','PLAY') AND "landingVisitId" = ANY(${visitIds}::text[])
            GROUP BY bucket ORDER BY bucket`
        : await prisma.$queryRaw<{ bucket: number; viewers: bigint }[]>`
            SELECT FLOOR(position / ${bucketSize})::int AS bucket, COUNT(DISTINCT "landingVisitId") AS viewers
            FROM "VideoWatchEvent"
            WHERE "videoId" = ${id} AND "eventType" IN ('HEARTBEAT','PLAY') AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
            GROUP BY bucket ORDER BY bucket`;
      const total = retRows[0] ? Number(retRows[0].viewers) : 0;
      retention = Array.from({ length: buckets }, (_, i) => {
        const entry = retRows.find((r) => r.bucket === i);
        const v = entry ? Number(entry.viewers) : 0;
        return { second: i * bucketSize, viewers: v, viewersPercent: total > 0 ? v / total : 0 };
      });
    }

    // Time series from events
    const timeSeriesRows = landingId
      ? await prisma.$queryRaw<{ date: Date; views: bigint }[]>`
          SELECT DATE("serverTimestamp") AS date, COUNT(DISTINCT "landingVisitId") AS views
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" = 'PLAY' AND "landingVisitId" = ANY(${visitIds}::text[])
          GROUP BY DATE("serverTimestamp") ORDER BY date`
      : await prisma.$queryRaw<{ date: Date; views: bigint }[]>`
          SELECT DATE("serverTimestamp") AS date, COUNT(DISTINCT "landingVisitId") AS views
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" = 'PLAY' AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
          GROUP BY DATE("serverTimestamp") ORDER BY date`;
    timeSeriesData = timeSeriesRows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      views: Number(r.views),
    }));
  } else {
    // --- Fallback: aggregate data from LandingVisit (no minimum-watch filter) ---
    const videoViewers = allVisits.filter((v) => v.videoPlayed);
    uniqueViewers = videoViewers.length;
    views = videoViewers.length;
    totalWatchTime = videoViewers.reduce((sum, v) => sum + (v.videoWatchTime ?? 0), 0);
    completedCount = videoViewers.filter((v) => v.videoCompleted).length;

    // Time series from visits
    const byDate: Record<string, number> = {};
    for (const v of videoViewers) {
      const d = v.visitedAt.toISOString().split("T")[0];
      byDate[d] = (byDate[d] || 0) + 1;
    }
    timeSeriesData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, views: count }));
  }

  // Recent watches (always from LandingVisit)
  const recentWatches = allVisits
    .filter((v) => v.videoPlayed)
    .slice(0, 20)
    .map((v) => ({
      sessionId: v.id,
      startedAt: v.visitedAt.toISOString(),
      duration: v.videoWatchTime ?? 0,
      completed: v.videoCompleted,
      country: v.country,
      device: v.deviceType,
      browser: v.browser,
    }));

  // --- Watch heatmap: per-segment intensity + per-session strips ---
  const totalSeconds = video.durationSeconds ?? 0;
  const bucketSize = 5;
  const buckets = totalSeconds > 0 ? Math.ceil(totalSeconds / bucketSize) : 0;
  let heatmap: { second: number; intensity: number }[] = [];
  let sessionStrips: {
    sessionId: string;
    startedAt: string;
    country: string | null;
    device: string | null;
    segments: boolean[];
  }[] = [];

  if (eventCount > 0 && buckets > 0) {
    // Aggregate heatmap — count ALL heartbeats per bucket (including replays)
    const heatRows = landingId
      ? await prisma.$queryRaw<{ bucket: number; hits: bigint }[]>`
          SELECT FLOOR(position / ${bucketSize})::int AS bucket, COUNT(*) AS hits
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" = 'HEARTBEAT' AND "landingVisitId" = ANY(${visitIds}::text[])
          GROUP BY bucket ORDER BY bucket`
      : await prisma.$queryRaw<{ bucket: number; hits: bigint }[]>`
          SELECT FLOOR(position / ${bucketSize})::int AS bucket, COUNT(*) AS hits
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" = 'HEARTBEAT' AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
          GROUP BY bucket ORDER BY bucket`;
    const maxHits = heatRows.reduce((m, r) => Math.max(m, Number(r.hits)), 1);
    heatmap = Array.from({ length: buckets }, (_, i) => {
      const entry = heatRows.find((r) => r.bucket === i);
      return { second: i * bucketSize, intensity: entry ? Number(entry.hits) / maxHits : 0 };
    });

    // Per-session strips — which segments each viewer watched
    const sessionEvents = landingId
      ? await prisma.$queryRaw<{ landingVisitId: string; bucket: number }[]>`
          SELECT DISTINCT "landingVisitId", FLOOR(position / ${bucketSize})::int AS bucket
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" IN ('HEARTBEAT','PLAY') AND "landingVisitId" = ANY(${visitIds}::text[])`
      : await prisma.$queryRaw<{ landingVisitId: string; bucket: number }[]>`
          SELECT DISTINCT "landingVisitId", FLOOR(position / ${bucketSize})::int AS bucket
          FROM "VideoWatchEvent"
          WHERE "videoId" = ${id} AND "eventType" IN ('HEARTBEAT','PLAY') AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}`;

    // Group by session
    const sessionMap = new Map<string, Set<number>>();
    for (const e of sessionEvents) {
      if (!sessionMap.has(e.landingVisitId)) sessionMap.set(e.landingVisitId, new Set());
      sessionMap.get(e.landingVisitId)!.add(e.bucket);
    }

    // Match with visit metadata
    const visitLookup = new Map(allVisits.map((v) => [v.id, v]));
    sessionStrips = [...sessionMap.entries()]
      .slice(0, 30)
      .map(([sessionId, watchedBuckets]) => {
        const visit = visitLookup.get(sessionId);
        return {
          sessionId,
          startedAt: visit?.visitedAt.toISOString() ?? '',
          country: visit?.country ?? null,
          device: visit?.deviceType ?? null,
          segments: Array.from({ length: buckets }, (_, i) => watchedBuckets.has(i)),
        };
      });
  }

  return NextResponse.json({
    overview: {
      totalViews: views,
      uniqueViewers,
      totalWatchTime,
      avgViewDuration: views > 0 ? Math.round(totalWatchTime / views) : 0,
      completionRate: uniqueViewers > 0 ? completedCount / uniqueViewers : 0,
      playRate: landingVisits > 0 ? views / landingVisits : 0,
    },
    durationSeconds: totalSeconds,
    retention,
    dropOffPoints: [],
    viewsTimeSeries: timeSeriesData,
    replayHeatmap: heatmap,
    sessionStrips,
    geography: [],
    devices: [],
    browsers: [],
    os: [],
    referrers: [],
    playbackSpeeds: [],
    recentWatches,
  });
}
