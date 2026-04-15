import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinalizeWorker } from './finalize.worker';
import { EventCode } from '@laptopguru-crm/shared';

function makePrisma() {
  const sessions = new Map<string, any>();
  const secondStats = new Map<string, any>();
  const visits = new Map<string, any>();
  const tx = {
    videoPlaybackSession: {
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(sessions.get(where.id), data);
        return sessions.get(where.id);
      }),
    },
    videoSecondStats: {
      upsert: vi.fn(async ({ where: { videoId_second }, create, update }: any) => {
        const key = `${videoId_second.videoId}:${videoId_second.second}`;
        const cur = secondStats.get(key);
        if (!cur) {
          secondStats.set(key, { ...create });
        } else {
          cur.views += update.views.increment;
          cur.replays += update.replays.increment;
          cur.pauseCount += update.pauseCount.increment;
          cur.seekAwayCount += update.seekAwayCount.increment;
        }
      }),
    },
    landingVisit: {
      update: vi.fn(async ({ where, data }: any) => {
        const row = visits.get(where.id) ?? {};
        Object.assign(row, data);
        visits.set(where.id, row);
      }),
    },
  };
  return {
    sessions, secondStats, visits,
    videoPlaybackSession: {
      findUnique: vi.fn(async ({ where }: any) => sessions.get(where.id) ?? null),
    },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
}

function session(id: string, trace: any[], overrides: Partial<any> = {}) {
  return {
    id,
    landingVisitId: 'visit1',
    videoId: 'vid1',
    companyId: 'c1',
    videoDurationMs: 300_000,
    trace,
    finalized: false,
    endedAt: new Date(),
    endReason: 'CLOSED',
    ...overrides,
  };
}

describe('FinalizeWorker', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let worker: FinalizeWorker;

  beforeEach(() => {
    prisma = makePrisma();
    worker = new FinalizeWorker(prisma as never);
  });

  it('marks an empty session finalized with zero aggregates', async () => {
    prisma.sessions.set('s1', session('s1', []));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const row = prisma.sessions.get('s1')!;
    expect(row.finalized).toBe(true);
    expect(row.durationWatchedMs).toBe(0);
    expect(prisma.secondStats.size).toBe(0);
  });

  it('computes aggregates and upserts second stats for a normal session', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const row = prisma.sessions.get('s1')!;
    expect(row.finalized).toBe(true);
    expect(row.durationWatchedMs).toBe(5000);
    expect(prisma.secondStats.size).toBe(5);
  });

  it('is idempotent — running twice does not double-increment second stats', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [3000, EventCode.PAUSE, 3000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const v0 = prisma.secondStats.get('vid1:0');
    expect(v0!.views).toBe(1);
  });

  it('updates LandingVisit denormalized fields', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const visit = prisma.visits.get('visit1')!;
    expect(visit.videoPlayed).toBe(true);
    expect(visit.videoWatchTime).toBe(5);
  });

  it('sets videoCompleted=true when completionPercent >= 0.95', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [300_000, EventCode.ENDED, 300_000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const visit = prisma.visits.get('visit1')!;
    expect(visit.videoCompleted).toBe(true);
  });

  it('skips a session that is already finalized', async () => {
    prisma.sessions.set('s1', session('s1', [], { finalized: true, durationWatchedMs: 999 }));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    expect(prisma.sessions.get('s1')!.durationWatchedMs).toBe(999);
  });
});
