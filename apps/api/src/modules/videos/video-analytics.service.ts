import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAnalyticsData } from '@laptopguru-crm/shared';

@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullAnalytics(
    videoId: string,
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<VideoAnalyticsData> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.companyId !== companyId) throw new NotFoundException();
    if (video.source !== 'S3') {
      throw new BadRequestException('Detailed analytics available only for S3 videos');
    }

    const [overview, retention, timeSeries, recentWatches] = await Promise.all([
      this.getOverview(video, from, to),
      this.getRetentionCurve(video, from, to),
      this.getViewsTimeSeries(videoId, from, to),
      this.getRecentWatches(videoId, from, to),
    ]);

    return {
      overview,
      retention,
      dropOffPoints: this.computeDropOff(retention),
      viewsTimeSeries: timeSeries,
      replayHeatmap: [],
      geography: [],
      devices: [],
      browsers: [],
      os: [],
      referrers: [],
      playbackSpeeds: [],
      recentWatches,
    };
  }

  private async getOverview(video: any, from: Date, to: Date) {
    const minWatch = Number(process.env.VIDEO_MIN_WATCH_FOR_VIEW_SECONDS || 10);

    // Segment-based aggregation: a PLAY or HEARTBEAT row "opens" a segment that is
    // closed by the next event for the same visit. We sum (nextPos - pos) across
    // consecutive pairs where the opener is PLAY or HEARTBEAT. Deltas are clamped
    // to [0, 600] seconds to guard against clock glitches and single-segment abuse.
    // This replaces the old COUNT(HEARTBEAT)*5 approximation, which overcounted on
    // synthetic heartbeats and undercounted the tail of each play segment.
    const rows = (await this.prisma.$queryRaw`
      WITH ordered AS (
        SELECT
          "landingVisitId",
          "eventType",
          "position",
          LEAD("eventType") OVER w AS next_type,
          LEAD("position")  OVER w AS next_pos
        FROM "VideoWatchEvent"
        WHERE "videoId" = ${video.id}
          AND "serverTimestamp" BETWEEN ${from} AND ${to}
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
      GROUP BY "landingVisitId"
    `) as { landingVisitId: string; totalWatch: number | bigint; completed: boolean }[];

    const views = rows.filter((r) => Number(r.totalWatch) >= minWatch).length;
    const totalWatchTime = rows.reduce((sum, r) => sum + Number(r.totalWatch), 0);
    const completedCount = rows.filter((r) => r.completed).length;

    const landingVisits = await this.prisma.landingVisit.count({
      where: {
        landing: { videoId: video.id },
        visitedAt: { gte: from, lte: to },
      },
    });

    return {
      totalViews: views,
      uniqueViewers: rows.length,
      totalWatchTime,
      avgViewDuration: views > 0 ? Math.round(totalWatchTime / views) : 0,
      completionRate: rows.length > 0 ? completedCount / rows.length : 0,
      playRate: landingVisits > 0 ? views / landingVisits : 0,
    };
  }

  private async getRetentionCurve(video: any, from: Date, to: Date) {
    const totalSeconds = video.durationSeconds ?? 0;
    if (totalSeconds === 0) return [];

    const bucketSize = 5;
    const buckets = Math.ceil(totalSeconds / bucketSize);

    const result = (await this.prisma.$queryRaw`
      SELECT
        FLOOR(position / ${bucketSize})::int AS bucket,
        COUNT(DISTINCT "landingVisitId") AS viewers
      FROM "VideoWatchEvent"
      WHERE "videoId" = ${video.id}
        AND "eventType" IN ('HEARTBEAT', 'PLAY')
        AND "serverTimestamp" BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket
    `) as { bucket: number; viewers: bigint }[];

    const total = result[0] ? Number(result[0].viewers) : 0;

    return Array.from({ length: buckets }, (_, i) => {
      const entry = result.find((r) => r.bucket === i);
      const viewers = entry ? Number(entry.viewers) : 0;
      return {
        second: i * bucketSize,
        viewers,
        viewersPercent: total > 0 ? viewers / total : 0,
      };
    });
  }

  private computeDropOff(retention: { second: number; viewersPercent: number }[]) {
    const drops: { second: number; dropPercent: number }[] = [];
    for (let i = 1; i < retention.length; i++) {
      const drop = retention[i - 1].viewersPercent - retention[i].viewersPercent;
      if (drop > 0.05) {
        drops.push({ second: retention[i].second, dropPercent: drop });
      }
    }
    return drops.sort((a, b) => b.dropPercent - a.dropPercent).slice(0, 5);
  }

  private async getViewsTimeSeries(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.$queryRaw`
      SELECT
        DATE("serverTimestamp") AS date,
        COUNT(DISTINCT "landingVisitId") AS views
      FROM "VideoWatchEvent"
      WHERE "videoId" = ${videoId}
        AND "eventType" = 'PLAY'
        AND "serverTimestamp" BETWEEN ${from} AND ${to}
      GROUP BY DATE("serverTimestamp")
      ORDER BY date
    `) as { date: Date; views: bigint }[];

    return rows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      views: Number(r.views),
    }));
  }

  private async getRecentWatches(videoId: string, from: Date, to: Date) {
    // Single query: segment-based watch duration joined with LandingVisit metadata.
    // Eliminates the previous raw SQL + findMany N+1 round trip.
    const rows = (await this.prisma.$queryRaw`
      WITH ordered AS (
        SELECT
          "landingVisitId",
          "eventType",
          "position",
          "serverTimestamp",
          LEAD("eventType") OVER w AS next_type,
          LEAD("position")  OVER w AS next_pos
        FROM "VideoWatchEvent"
        WHERE "videoId" = ${videoId}
          AND "serverTimestamp" BETWEEN ${from} AND ${to}
          AND "eventType" IN ('PLAY','PAUSE','SEEK','ENDED','HEARTBEAT')
        WINDOW w AS (PARTITION BY "landingVisitId" ORDER BY "serverTimestamp", "id")
      ),
      per_visit AS (
        SELECT
          "landingVisitId",
          MIN("serverTimestamp") AS "startedAt",
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
        GROUP BY "landingVisitId"
      )
      SELECT
        pv."landingVisitId",
        pv."startedAt",
        pv."totalWatch",
        pv."completed",
        v."sessionId",
        v."country",
        v."deviceType",
        v."browser"
      FROM per_visit pv
      LEFT JOIN "LandingVisit" v ON v."id" = pv."landingVisitId"
      ORDER BY pv."startedAt" DESC
      LIMIT 50
    `) as {
      landingVisitId: string;
      startedAt: Date;
      totalWatch: number | bigint;
      completed: boolean;
      sessionId: string | null;
      country: string | null;
      deviceType: string | null;
      browser: string | null;
    }[];

    return rows.map((r) => ({
      sessionId: r.sessionId || r.landingVisitId,
      startedAt: r.startedAt.toISOString(),
      duration: Number(r.totalWatch),
      completed: r.completed,
      country: r.country || null,
      device: r.deviceType || null,
      browser: r.browser || null,
    }));
  }
}
