import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoSessionsService } from './video-sessions.service';

function mockPrisma() {
  return {
    raw: {
      videoPlaybackSession: {
        upsert: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      videoSessionChunk: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

function mockQueue() {
  return { add: vi.fn() };
}

function mockRateLimit() {
  return { check: vi.fn().mockResolvedValue(true) };
}

describe('VideoSessionsService.createSession', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let queue: ReturnType<typeof mockQueue>;
  let rate: ReturnType<typeof mockRateLimit>;
  let service: VideoSessionsService;

  beforeEach(() => {
    prisma = mockPrisma();
    queue = mockQueue();
    rate = mockRateLimit();
    service = new VideoSessionsService(prisma as never, queue as never, rate as never);
  });

  it('creates (or returns existing) session via upsert on (visitId,videoId,startedAt)', async () => {
    prisma.raw.videoPlaybackSession.upsert.mockResolvedValue({ id: 's1' });
    const ctx = { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' };
    const started = '2026-04-14T12:00:00.000Z';
    const out = await service.createSession(ctx, { videoDurationMs: 120000, clientStartedAt: started });

    expect(out).toEqual({ sessionId: 's1' });
    expect(prisma.raw.videoPlaybackSession.upsert).toHaveBeenCalledWith({
      where: {
        landingVisitId_videoId_startedAt: {
          landingVisitId: 'v1',
          videoId: 'vid1',
          startedAt: new Date(started),
        },
      },
      update: {},
      create: {
        landingVisitId: 'v1',
        videoId: 'vid1',
        companyId: 'c1',
        startedAt: new Date(started),
        videoDurationMs: 120000,
      },
      select: { id: true },
    });
  });

  it('rate-limits at 10/min per visit', async () => {
    rate.check.mockResolvedValueOnce(false);
    await expect(
      service.createSession(
        { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' },
        { videoDurationMs: 1, clientStartedAt: '2026-04-14T00:00:00.000Z' },
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(rate.check).toHaveBeenCalledWith('ratelimit:session-create:v1', 10, 60);
  });
});
