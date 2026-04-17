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
      $executeRaw: vi.fn(),
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
    const started = new Date(Date.now() - 60_000).toISOString();
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

  it('rejects invalid clientStartedAt strings with 400', async () => {
    await expect(
      service.createSession(
        { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' },
        { videoDurationMs: 1000, clientStartedAt: 'not-a-date' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects clientStartedAt outside the skew window with 400', async () => {
    // 48 hours in the past
    const pastFar = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await expect(
      service.createSession(
        { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' },
        { videoDurationMs: 1000, clientStartedAt: pastFar },
      ),
    ).rejects.toMatchObject({ status: 400 });

    // 10 minutes in the future
    const futureFar = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await expect(
      service.createSession(
        { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' },
        { videoDurationMs: 1000, clientStartedAt: futureFar },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('VideoSessionsService.appendChunk', () => {
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

  const ctx = { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1', sessionId: 's1' };

  it('rejects events array with invalid tuples', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [['bad']], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects when position exceeds videoDurationMs + 1000', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [[0, 1, 11500]], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns 410 for finalized sessions', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: true,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [[0, 1, 0]], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 410 });
  });

  it('inserts chunk row, appends to trace, increments chunksReceived', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    prisma.raw.videoSessionChunk.create.mockResolvedValue({});
    await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0], [250, 0, 250]], final: false } as never,
      { beacon: false },
    );
    expect(prisma.raw.videoSessionChunk.create).toHaveBeenCalledWith({
      data: { sessionId: 's1', seq: 1 },
    });
  });

  it('returns 202 on duplicate seq (unique-conflict swallowed)', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    const err = new Error('duplicate') as Error & { code?: string };
    err.code = 'P2002';
    prisma.raw.videoSessionChunk.create.mockRejectedValue(err);
    const out = await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: false } as never,
      { beacon: false },
    );
    expect(out).toEqual({ deduped: true });
  });

  it('enqueues finalize job when final=true', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: true, endReason: 'ENDED' } as never,
      { beacon: false },
    );
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's1', reason: 'CLIENT_FINAL' });
  });

  it('beacon mode skips per-session rate limit', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    rate.check.mockResolvedValue(false);
    const out = await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: true } as never,
      { beacon: true },
    );
    expect(out).toEqual({ accepted: true });
  });
});
