import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoAnalyticsService } from './video-analytics.service';
import { NotFoundException } from '@nestjs/common';

function prismaMock() {
  return {
    video: { findFirst: vi.fn() },
    videoPlaybackSession: { findMany: vi.fn() },
    videoSecondStats: { findMany: vi.fn() },
  };
}

describe('VideoAnalyticsService (new)', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: VideoAnalyticsService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new VideoAnalyticsService(prisma as never);
  });

  it('throws when the video is outside the company', async () => {
    prisma.video.findFirst.mockResolvedValue(null);
    await expect(service.getAnalytics('v', 'c')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns zeroed overview when no sessions', async () => {
    prisma.video.findFirst.mockResolvedValue({ id: 'v', durationSeconds: 300 });
    prisma.videoPlaybackSession.findMany.mockResolvedValue([]);
    prisma.videoSecondStats.findMany.mockResolvedValue([]);
    const r = await service.getAnalytics('v', 'c');
    expect(r.overview.sessions).toBe(0);
    expect(r.overview.completionRate).toBe(0);
    expect(r.retention).toEqual([]);
    expect(r.recentSessions).toEqual([]);
  });

  it('aggregates sessions into overview and forwards retention rows', async () => {
    prisma.video.findFirst.mockResolvedValue({ id: 'v', durationSeconds: 300 });
    prisma.videoPlaybackSession.findMany.mockResolvedValue([
      {
        id: 's1', landingVisitId: 'vv1',
        startedAt: new Date('2026-04-14T00:00:00Z'), endedAt: new Date('2026-04-14T00:05:00Z'),
        durationWatchedMs: 300_000, completionPercent: 1, endReason: 'ENDED', errorCount: 0,
        visit: {
          country: 'PL', deviceType: 'desktop', browser: 'Chrome', referrerDomain: 'x.com',
          sessionId: 'sess-a', landing: { slug: 'l1' },
        },
      },
    ]);
    prisma.videoSecondStats.findMany.mockResolvedValue([
      { second: 0, views: 1, replays: 0, pauseCount: 0, seekAwayCount: 0 },
    ]);
    const r = await service.getAnalytics('v', 'c');
    expect(r.overview.sessions).toBe(1);
    expect(r.overview.completionRate).toBe(1);
    expect(r.retention[0].views).toBe(1);
    expect(r.recentSessions[0].landingSlug).toBe('l1');
  });
});
