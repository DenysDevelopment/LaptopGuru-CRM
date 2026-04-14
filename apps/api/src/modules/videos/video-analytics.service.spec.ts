import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VideoAnalyticsService } from './video-analytics.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

function createMockPrisma() {
  return {
    video: { findUnique: vi.fn() },
    landingVisit: { count: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
}

describe('VideoAnalyticsService', () => {
  let service: VideoAnalyticsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const from = new Date('2026-01-01');
  const to = new Date('2026-01-31');

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VideoAnalyticsService(prisma as any);
  });

  describe('getFullAnalytics', () => {
    it('throws NotFoundException when video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.getFullAnalytics('x', 'c1', from, to)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when companyId mismatch', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'x', companyId: 'other', source: 'S3' });
      await expect(service.getFullAnalytics('x', 'c1', from, to)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for YouTube videos', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'x', companyId: 'c1', source: 'YOUTUBE' });
      await expect(service.getFullAnalytics('x', 'c1', from, to)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOverview (via getFullAnalytics)', () => {
    const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 60 };

    it('calculates overview from heartbeat events', async () => {
      prisma.video.findUnique.mockResolvedValue(video);

      // $queryRaw calls in order: overview, retention, timeSeries, recentWatches
      prisma.$queryRaw
        // Overview: 1 viewer with 20s watch time, completed
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: BigInt(20), completed: true },
        ])
        // Retention
        .mockResolvedValueOnce([
          { bucket: 0, viewers: BigInt(1) },
          { bucket: 1, viewers: BigInt(1) },
          { bucket: 2, viewers: BigInt(1) },
          { bucket: 3, viewers: BigInt(1) },
        ])
        // TimeSeries
        .mockResolvedValueOnce([])
        // RecentWatches
        .mockResolvedValueOnce([]);

      prisma.landingVisit.count.mockResolvedValue(5);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.overview.totalViews).toBe(1); // 20s >= 10s min
      expect(result.overview.uniqueViewers).toBe(1);
      expect(result.overview.totalWatchTime).toBe(20);
      expect(result.overview.avgViewDuration).toBe(20);
      expect(result.overview.completionRate).toBe(1);
      expect(result.overview.playRate).toBeCloseTo(0.2); // 1/5
    });

    it('filters out viewers below min watch threshold', async () => {
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        // Overview: 2 viewers, one with 5s (below threshold), one with 15s
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: BigInt(5), completed: false },
          { landingVisitId: 'lv2', totalWatch: BigInt(15), completed: true },
        ])
        .mockResolvedValueOnce([]) // retention
        .mockResolvedValueOnce([]) // timeSeries
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(10);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.overview.totalViews).toBe(1); // only lv2 counted
      expect(result.overview.uniqueViewers).toBe(2); // both are unique
      expect(result.overview.totalWatchTime).toBe(20); // 5+15
      expect(result.overview.avgViewDuration).toBe(20); // 20/1
      expect(result.overview.completionRate).toBe(0.5); // 1/2
    });

    it('returns zero rates when no data', async () => {
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([]) // overview
        .mockResolvedValueOnce([]) // retention
        .mockResolvedValueOnce([]) // timeSeries
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(0);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.overview.totalViews).toBe(0);
      expect(result.overview.avgViewDuration).toBe(0);
      expect(result.overview.completionRate).toBe(0);
      expect(result.overview.playRate).toBe(0);
    });
  });

  describe('retention curve', () => {
    it('returns empty when durationSeconds is null', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: null };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([]) // overview
        .mockResolvedValueOnce([]) // retention (won't be called due to early return)
        .mockResolvedValueOnce([]) // timeSeries
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(0);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);
      expect(result.retention).toEqual([]);
    });

    it('builds correct retention buckets for 30s video', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 30 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        // Overview
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: BigInt(30), completed: true },
          { landingVisitId: 'lv2', totalWatch: BigInt(15), completed: false },
          { landingVisitId: 'lv3', totalWatch: BigInt(10), completed: false },
        ])
        // Retention: 3 viewers at start, 2 at 5-10s, 1 at 15-25s
        .mockResolvedValueOnce([
          { bucket: 0, viewers: BigInt(3) },
          { bucket: 1, viewers: BigInt(3) },
          { bucket: 2, viewers: BigInt(2) },
          { bucket: 3, viewers: BigInt(1) },
          { bucket: 4, viewers: BigInt(1) },
          { bucket: 5, viewers: BigInt(1) },
        ])
        .mockResolvedValueOnce([]) // timeSeries
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(5);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      // 30s / 5s = 6 buckets
      expect(result.retention).toHaveLength(6);
      expect(result.retention[0]).toEqual({ second: 0, viewers: 3, viewersPercent: 1 });
      expect(result.retention[1]).toEqual({ second: 5, viewers: 3, viewersPercent: 1 });
      expect(result.retention[2]).toEqual({ second: 10, viewers: 2, viewersPercent: 2 / 3 });
      expect(result.retention[3]).toEqual({ second: 15, viewers: 1, viewersPercent: 1 / 3 });
    });

    it('handles seek correctly — skipped seconds have no heartbeats', async () => {
      // Viewer seeks from 10 to 30 — seconds 10-30 get no heartbeats from this viewer
      // Retention should show a dip in the 10-30 range
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 60 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        // Overview
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: BigInt(40), completed: true },
        ])
        // Retention — viewer watched 0-10, then seeked to 30, watched 30-60
        // Buckets 0,1 (0-10s): 1 viewer
        // Buckets 2,3,4,5 (10-30s): 0 viewers (seeked over)
        // Buckets 6-11 (30-60s): 1 viewer
        .mockResolvedValueOnce([
          { bucket: 0, viewers: BigInt(1) },
          { bucket: 1, viewers: BigInt(1) },
          // buckets 2-5 missing = 0 viewers
          { bucket: 6, viewers: BigInt(1) },
          { bucket: 7, viewers: BigInt(1) },
          { bucket: 8, viewers: BigInt(1) },
          { bucket: 9, viewers: BigInt(1) },
          { bucket: 10, viewers: BigInt(1) },
          { bucket: 11, viewers: BigInt(1) },
        ])
        .mockResolvedValueOnce([]) // timeSeries
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(1);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      // 60s / 5s = 12 buckets
      expect(result.retention).toHaveLength(12);

      // First 2 buckets: 100%
      expect(result.retention[0].viewersPercent).toBe(1);
      expect(result.retention[1].viewersPercent).toBe(1);

      // Seeked-over buckets: 0%
      expect(result.retention[2].viewersPercent).toBe(0);
      expect(result.retention[3].viewersPercent).toBe(0);
      expect(result.retention[4].viewersPercent).toBe(0);
      expect(result.retention[5].viewersPercent).toBe(0);

      // After seek: 100% again
      expect(result.retention[6].viewersPercent).toBe(1);
      expect(result.retention[11].viewersPercent).toBe(1);
    });

    it('computes dropOffPoints from retention', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 20 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: BigInt(20), completed: true },
        ])
        // Big drop at bucket 2 (second 10): 10 -> 3
        .mockResolvedValueOnce([
          { bucket: 0, viewers: BigInt(10) },
          { bucket: 1, viewers: BigInt(10) },
          { bucket: 2, viewers: BigInt(3) },
          { bucket: 3, viewers: BigInt(2) },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      prisma.landingVisit.count.mockResolvedValue(10);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      // Drop from 100% to 30% = 70% drop at second 10
      expect(result.dropOffPoints.length).toBeGreaterThan(0);
      expect(result.dropOffPoints[0].second).toBe(10);
      expect(result.dropOffPoints[0].dropPercent).toBeCloseTo(0.7);
    });
  });

  describe('viewsTimeSeries', () => {
    it('formats dates correctly', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 30 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([]) // overview
        .mockResolvedValueOnce([]) // retention
        // TimeSeries
        .mockResolvedValueOnce([
          { date: new Date('2026-01-15'), views: BigInt(5) },
          { date: new Date('2026-01-16'), views: BigInt(12) },
        ])
        .mockResolvedValueOnce([]); // recentWatches

      prisma.landingVisit.count.mockResolvedValue(0);
      prisma.landingVisit.findMany.mockResolvedValue([]);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.viewsTimeSeries).toEqual([
        { date: '2026-01-15', views: 5 },
        { date: '2026-01-16', views: 12 },
      ]);
    });
  });

  describe('recentWatches', () => {
    it('enriches with landing visit data in a single query', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 30 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([]) // overview
        .mockResolvedValueOnce([]) // retention
        .mockResolvedValueOnce([]) // timeSeries
        // RecentWatches — LEFT JOIN with LandingVisit, all fields in one row
        .mockResolvedValueOnce([
          {
            landingVisitId: 'lv1',
            startedAt: new Date('2026-01-15T12:00:00Z'),
            totalWatch: 25,
            completed: true,
            sessionId: 'sess-123',
            country: 'PL',
            deviceType: 'desktop',
            browser: 'Chrome',
          },
        ]);

      prisma.landingVisit.count.mockResolvedValue(0);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      // findMany should no longer be invoked for recentWatches — the single raw
      // query now returns enrichment columns.
      expect(prisma.landingVisit.findMany).not.toHaveBeenCalled();

      expect(result.recentWatches).toHaveLength(1);
      expect(result.recentWatches[0]).toEqual({
        sessionId: 'sess-123',
        startedAt: '2026-01-15T12:00:00.000Z',
        duration: 25,
        completed: true,
        country: 'PL',
        device: 'desktop',
        browser: 'Chrome',
      });
    });

    it('accepts plain numeric totalWatch from segment aggregation', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 60 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        // Overview — segment SQL returns ::float, not bigint
        .mockResolvedValueOnce([
          { landingVisitId: 'lv1', totalWatch: 22.5, completed: true },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      prisma.landingVisit.count.mockResolvedValue(1);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.overview.totalWatchTime).toBe(22.5);
      expect(result.overview.totalViews).toBe(1);
      expect(result.overview.completionRate).toBe(1);
    });

    it('no longer calls landingVisit.findMany for recentWatches enrichment', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 60 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      prisma.landingVisit.count.mockResolvedValue(0);

      await service.getFullAnalytics('v1', 'c1', from, to);
      expect(prisma.landingVisit.findMany).not.toHaveBeenCalled();
    });

    it('uses window-function segment aggregation in source (guards against regression)', () => {
      const src = fs.readFileSync(
        path.join(__dirname, 'video-analytics.service.ts'),
        'utf8',
      );
      // The legacy count*5 approximation must be gone from getOverview/getRecentWatches.
      expect(src).not.toMatch(/COUNT\(\*\)\s*FILTER\s*\(WHERE\s*"eventType"\s*=\s*'HEARTBEAT'\)\s*\*\s*5/);
      // And the new LEAD() window must be present.
      expect(src).toMatch(/LEAD\("position"\)/);
      expect(src).toMatch(/PARTITION BY "landingVisitId"/);
    });

    it('falls back to landingVisitId when visit row is missing', async () => {
      const video = { id: 'v1', companyId: 'c1', source: 'S3', durationSeconds: 30 };
      prisma.video.findUnique.mockResolvedValue(video);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            landingVisitId: 'lv-orphan',
            startedAt: new Date('2026-01-15T12:00:00Z'),
            totalWatch: 25,
            completed: false,
            sessionId: null,
            country: null,
            deviceType: null,
            browser: null,
          },
        ]);

      prisma.landingVisit.count.mockResolvedValue(0);

      const result = await service.getFullAnalytics('v1', 'c1', from, to);

      expect(result.recentWatches[0].sessionId).toBe('lv-orphan');
      expect(result.recentWatches[0].country).toBeNull();
    });
  });
});
