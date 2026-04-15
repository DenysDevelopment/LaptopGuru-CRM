import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoSessionsService } from './video-sessions.service';
import { GoneException, BadRequestException } from '@nestjs/common';
import { EventCode } from '@laptopguru-crm/shared';

function makePrisma() {
  const store = {
    sessions: new Map<string, any>(),
    chunks: new Map<string, any>(),
  };
  let seq = 0;
  const prisma: any = {
    store,
    videoPlaybackSession: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const s of store.sessions.values()) {
          if (
            s.landingVisitId === where.landingVisitId &&
            s.videoId === where.videoId &&
            s.startedAt.getTime() === where.startedAt.getTime()
          ) return s;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `sess_${++seq}`;
        const row = { id, trace: [], chunksReceived: 0, finalized: false, endedAt: null, ...data };
        store.sessions.set(id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => store.sessions.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.sessions.get(where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    videoSessionChunk: {
      create: vi.fn(async ({ data }: any) => {
        const key = `${data.sessionId}:${data.seq}`;
        if (store.chunks.has(key)) {
          const err: any = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        store.chunks.set(key, data);
        return data;
      }),
    },
  };

  // $executeRaw shim — the service uses a tagged template:
  //   $executeRaw`UPDATE ... SET trace = trace || ${JSON.stringify(events)}::jsonb ... WHERE id = ${sessionId}`
  // Vitest/Prisma pass the template strings as the first arg and interpolated values as the rest.
  // We replay the append into the in-memory store.
  prisma.$executeRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const eventsJson = values[0] as string;
    const sid = values[1] as string;
    const row = store.sessions.get(sid);
    if (!row) return 0;
    row.trace = [...row.trace, ...JSON.parse(eventsJson)];
    row.chunksReceived += 1;
    return 1;
  });

  return prisma;
}

describe('VideoSessionsService', () => {
  const queue = { add: vi.fn(async () => ({ id: 'job' })) } as any;
  let prisma: ReturnType<typeof makePrisma>;
  let service: VideoSessionsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new VideoSessionsService(prisma as never, queue);
    queue.add.mockClear();
  });

  describe('createSession', () => {
    it('creates a new row with empty trace', async () => {
      const res = await service.createSession({
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: new Date('2026-04-14T00:00:00Z').getTime(),
      });
      expect(res.sessionId).toMatch(/^sess_/);
      expect(prisma.store.sessions.size).toBe(1);
    });

    it('is idempotent on (visitId, videoId, startedAt)', async () => {
      const args = {
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: new Date('2026-04-14T00:00:00Z').getTime(),
      };
      const a = await service.createSession(args);
      const b = await service.createSession(args);
      expect(a.sessionId).toBe(b.sessionId);
      expect(prisma.store.sessions.size).toBe(1);
    });
  });

  describe('appendChunk', () => {
    async function seed() {
      return service.createSession({
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: Date.now(),
      });
    }

    it('rejects empty events array', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, { seq: 0, events: [], final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects >500 events', async () => {
      const { sessionId } = await seed();
      const events = Array.from({ length: 501 }, (_, i) => [i, EventCode.TICK, i * 100]);
      await expect(service.appendChunk(sessionId, { seq: 0, events, final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a malformed tuple', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, { seq: 0, events: [['oops']] as any, final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects pos > videoDurationMs + 1000', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, {
        seq: 0,
        events: [[0, EventCode.TICK, 301_001]],
        final: false,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a valid chunk and appends to trace', async () => {
      const { sessionId } = await seed();
      const events = [[0, EventCode.PLAY, 0], [250, EventCode.TICK, 250]];
      const res = await service.appendChunk(sessionId, { seq: 0, events, final: false });
      expect(res.status).toBe('appended');
      const row = prisma.store.sessions.get(sessionId)!;
      expect(row.trace).toEqual(events);
      expect(row.chunksReceived).toBe(1);
    });

    it('returns "deduped" and does NOT append on duplicate seq', async () => {
      const { sessionId } = await seed();
      const events = [[0, EventCode.PLAY, 0]];
      await service.appendChunk(sessionId, { seq: 0, events, final: false });
      const res = await service.appendChunk(sessionId, { seq: 0, events, final: false });
      expect(res.status).toBe('deduped');
      expect(prisma.store.sessions.get(sessionId)!.trace).toHaveLength(1);
    });

    it('returns 410 Gone when session is finalized', async () => {
      const { sessionId } = await seed();
      prisma.store.sessions.get(sessionId)!.finalized = true;
      await expect(service.appendChunk(sessionId, {
        seq: 0, events: [[0, EventCode.PLAY, 0]], final: false,
      })).rejects.toBeInstanceOf(GoneException);
    });

    it('on final:true sets endedAt, endReason, and enqueues finalize job', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, {
        seq: 0,
        events: [[1000, EventCode.ENDED, 300_000]],
        final: true,
        endReason: 'ENDED',
      });
      const row = prisma.store.sessions.get(sessionId)!;
      expect(row.endedAt).toBeInstanceOf(Date);
      expect(row.endReason).toBe('ENDED');
      expect(queue.add).toHaveBeenCalledWith(
        'finalize',
        { sessionId, reason: 'CLIENT_FINAL' },
        expect.any(Object),
      );
    });

    it('on final:true with no endReason defaults to CLOSED', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, {
        seq: 0,
        events: [[1000, EventCode.PAUSE, 5000]],
        final: true,
      });
      expect(prisma.store.sessions.get(sessionId)!.endReason).toBe('CLOSED');
    });

    it('accepts late-arriving lower seq after higher seq already stored', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, { seq: 1, events: [[100, EventCode.TICK, 100]], final: false });
      const res = await service.appendChunk(sessionId, { seq: 0, events: [[0, EventCode.PLAY, 0]], final: false });
      expect(res.status).toBe('appended');
    });
  });
});
