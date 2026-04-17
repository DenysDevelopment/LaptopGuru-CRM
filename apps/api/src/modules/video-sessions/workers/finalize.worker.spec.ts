import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinalizeWorker } from './finalize.worker';

function mockPrisma() {
  const raw = {
    videoPlaybackSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    landingVisit: {
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
  } as {
    videoPlaybackSession: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    landingVisit: { update: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
    $transaction?: ReturnType<typeof vi.fn>;
  };
  raw.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(raw));
  return { raw };
}

describe('FinalizeWorker', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let worker: FinalizeWorker;

  beforeEach(() => {
    prisma = mockPrisma();
    worker = new FinalizeWorker(prisma as never);
  });

  it('exits early when session already finalized', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({ finalized: true });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).not.toHaveBeenCalled();
  });

  it('empty trace marks finalized with zero aggregates, skips secondStats upsert', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: 'INCOMPLETE',
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalized: true, durationWatchedMs: 0 }),
      }),
    );
    expect(prisma.raw.$executeRaw).not.toHaveBeenCalled();
  });

  it('normal session sets aggregates, upserts VideoSecondStats, updates LandingVisit', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [
        [0, 1, 0],      // PLAY
        [10000, 4, 10000], // ENDED
      ],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: 'ENDED',
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalled();
    expect(prisma.raw.$executeRaw).toHaveBeenCalled(); // secondStats upsert
    expect(prisma.raw.landingVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lv1' },
        data: expect.objectContaining({
          videoPlayed: true,
          videoWatchTime: 10,
          videoCompleted: true,
        }),
      }),
    );
  });

  it('wraps the three writes in a single transaction', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [
        [0, 1, 0],
        [10000, 4, 10000],
      ],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: 'ENDED',
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.$transaction).toHaveBeenCalledTimes(1);
  });

  it('empty-trace path sets endReason fallback to INCOMPLETE when session had none', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: null,
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalized: true, endReason: 'INCOMPLETE' }),
      }),
    );
  });
});
