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

    const rows = (await this.prisma.$queryRaw`
      SELECT
        "landingVisitId",
        COUNT(*) FILTER (WHERE "eventType" = 'HEARTBEAT') * 5 AS "totalWatch",
        BOOL_OR("eventType" = 'ENDED') AS completed
      FROM "VideoWatchEvent"
      WHERE "videoId" = ${video.id}
        AND "serverTimestamp" BETWEEN ${from} AND ${to}
      GROUP BY "landingVisitId"
    `) as { landingVisitId: string; totalWatch: bigint; completed: boolean }[];

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
    const rows = (await this.prisma.$queryRaw`
      SELECT
        "landingVisitId",
        MIN("serverTimestamp") AS "startedAt",
        COUNT(*) FILTER (WHERE "eventType" = 'HEARTBEAT') * 5 AS "totalWatch",
        BOOL_OR("eventType" = 'ENDED') AS completed
      FROM "VideoWatchEvent"
      WHERE "videoId" = ${videoId}
        AND "serverTimestamp" BETWEEN ${from} AND ${to}
      GROUP BY "landingVisitId"
      ORDER BY "startedAt" DESC
      LIMIT 50
    `) as {
      landingVisitId: string;
      startedAt: Date;
      totalWatch: bigint;
      completed: boolean;
    }[];

    // Enrich with LandingVisit data
    const visitIds = rows.map((r) => r.landingVisitId);
    const visits = await this.prisma.landingVisit.findMany({
      where: { id: { in: visitIds } },
      select: {
        id: true,
        sessionId: true,
        country: true,
        deviceType: true,
        browser: true,
      },
    });
    const visitMap = new Map(visits.map((v) => [v.id, v]));

    return rows.map((r) => {
      const visit = visitMap.get(r.landingVisitId);
      return {
        sessionId: visit?.sessionId || r.landingVisitId,
        startedAt: r.startedAt.toISOString(),
        duration: Number(r.totalWatch),
        completed: r.completed,
        country: visit?.country || null,
        device: visit?.deviceType || null,
        browser: visit?.browser || null,
      };
    });
  }
}
