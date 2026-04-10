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
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const toDate = to ? new Date(to) : new Date();

  const minWatch = Number(process.env.VIDEO_MIN_WATCH_FOR_VIEW_SECONDS || 10);

  // Overview
  const watchRows = await prisma.$queryRaw<
    { landingVisitId: string; totalWatch: bigint; completed: boolean }[]
  >`
    SELECT
      "landingVisitId",
      COUNT(*) FILTER (WHERE "eventType" = 'HEARTBEAT') * 5 AS "totalWatch",
      BOOL_OR("eventType" = 'ENDED') AS completed
    FROM "VideoWatchEvent"
    WHERE "videoId" = ${id}
      AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
    GROUP BY "landingVisitId"
  `;

  const views = watchRows.filter((r) => Number(r.totalWatch) >= minWatch).length;
  const totalWatchTime = watchRows.reduce((sum, r) => sum + Number(r.totalWatch), 0);
  const completedCount = watchRows.filter((r) => r.completed).length;

  const landingVisits = await prisma.landingVisit.count({
    where: {
      landing: { videoId: id },
      visitedAt: { gte: fromDate, lte: toDate },
    },
  });

  // Retention
  const totalSeconds = video.durationSeconds ?? 0;
  const bucketSize = 5;
  const buckets = totalSeconds > 0 ? Math.ceil(totalSeconds / bucketSize) : 0;

  let retention: { second: number; viewers: number; viewersPercent: number }[] = [];
  if (buckets > 0) {
    const retRows = await prisma.$queryRaw<{ bucket: number; viewers: bigint }[]>`
      SELECT
        FLOOR(position / ${bucketSize})::int AS bucket,
        COUNT(DISTINCT "landingVisitId") AS viewers
      FROM "VideoWatchEvent"
      WHERE "videoId" = ${id}
        AND "eventType" IN ('HEARTBEAT', 'PLAY')
        AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
      GROUP BY bucket
      ORDER BY bucket
    `;
    const total = retRows[0] ? Number(retRows[0].viewers) : 0;
    retention = Array.from({ length: buckets }, (_, i) => {
      const entry = retRows.find((r) => r.bucket === i);
      const v = entry ? Number(entry.viewers) : 0;
      return { second: i * bucketSize, viewers: v, viewersPercent: total > 0 ? v / total : 0 };
    });
  }

  // Views time series
  const timeSeriesRows = await prisma.$queryRaw<{ date: Date; views: bigint }[]>`
    SELECT
      DATE("serverTimestamp") AS date,
      COUNT(DISTINCT "landingVisitId") AS views
    FROM "VideoWatchEvent"
    WHERE "videoId" = ${id}
      AND "eventType" = 'PLAY'
      AND "serverTimestamp" BETWEEN ${fromDate} AND ${toDate}
    GROUP BY DATE("serverTimestamp")
    ORDER BY date
  `;

  return NextResponse.json({
    overview: {
      totalViews: views,
      uniqueViewers: watchRows.length,
      totalWatchTime,
      avgViewDuration: views > 0 ? Math.round(totalWatchTime / views) : 0,
      completionRate: watchRows.length > 0 ? completedCount / watchRows.length : 0,
      playRate: landingVisits > 0 ? views / landingVisits : 0,
    },
    retention,
    dropOffPoints: [],
    viewsTimeSeries: timeSeriesRows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      views: Number(r.views),
    })),
    replayHeatmap: [],
    geography: [],
    devices: [],
    browsers: [],
    os: [],
    referrers: [],
    playbackSpeeds: [],
    recentWatches: [],
  });
}
