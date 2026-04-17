import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoAnalyticsService } from './video-analytics.service';
import { NotFoundException } from '@nestjs/common';

function mockPrisma() {
  return {
    raw: {
      video: { findUnique: vi.fn() },
      $queryRaw: vi.fn(),
    },
  };
}

describe('VideoAnalyticsService (session-trace)', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: VideoAnalyticsService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new VideoAnalyticsService(prisma as never);
  });

  it('throws NotFound when video missing', async () => {
    prisma.raw.video.findUnique.mockResolvedValue(null);
    await expect(
      service.getFullAnalytics('x', 'c1', new Date(), new Date()),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when companyId mismatch', async () => {
    prisma.raw.video.findUnique.mockResolvedValue({ id: 'x', companyId: 'other', durationSeconds: 60 });
    await expect(
      service.getFullAnalytics('x', 'c1', new Date(), new Date()),
    ).rejects.toThrow(NotFoundException);
  });

  it('composes aggregates and breakdowns from $queryRaw calls', async () => {
    prisma.raw.video.findUnique.mockResolvedValue({ id: 'v1', companyId: 'c1', durationSeconds: 10 });
    // Dispatch SQL to a router keyed on the first identifier in the template
    // string, so the order in which Promise.all resolves branches doesn't
    // matter for the test.
    prisma.raw.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('VideoPlaybackSession') && sql.includes('sessionCount')) {
        return Promise.resolve([
          { sessionCount: 3, uniqueViewers: 2, totalWatchMs: 15000, avgWatchMs: 5000, avgCompletion: 0.5, errorCount: 0 },
        ]);
      }
      if (sql.includes('LandingVisit') && sql.includes('JOIN "Landing"')) {
        return Promise.resolve([{ c: 10 }]);
      }
      if (sql.includes('VideoSecondStats') && sql.includes('"pauseCount" > 0')) {
        return Promise.resolve([{ second: 3, c: 2 }]);
      }
      if (sql.includes('VideoSecondStats') && sql.includes('"seekAwayCount" > 0')) {
        return Promise.resolve([{ second: 5, c: 1 }]);
      }
      if (sql.includes('VideoSecondStats')) {
        return Promise.resolve([{ second: 0, views: 3, replays: 1 }]);
      }
      if (sql.includes('DATE("startedAt")')) {
        return Promise.resolve([{ date: new Date('2026-04-01'), views: 2 }]);
      }
      // recentSessions + breakdowns: return empty
      return Promise.resolve([]);
    });

    const out = await service.getFullAnalytics('v1', 'c1', new Date(), new Date());
    expect(out.overview.totalViews).toBe(3);
    expect(out.overview.totalWatchTime).toBe(15);
    expect(out.overview.playRate).toBe(0.3);
    expect(out.retention.length).toBe(10); // durationSeconds buckets
    expect(out.topPauseSeconds).toEqual([{ second: 3, count: 2 }]);
  });
});
