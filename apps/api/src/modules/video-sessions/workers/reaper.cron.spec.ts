import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReaperCron } from './reaper.cron';

describe('ReaperCron', () => {
  let prisma: {
    raw: { videoPlaybackSession: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
  };
  let queue: { add: ReturnType<typeof vi.fn> };
  let cron: ReaperCron;

  beforeEach(() => {
    prisma = {
      raw: {
        videoPlaybackSession: { findMany: vi.fn(), update: vi.fn() },
      },
    };
    queue = { add: vi.fn() };
    cron = new ReaperCron(prisma as never, queue as never);
  });

  it('picks up stale sessions and enqueues finalize', async () => {
    prisma.raw.videoPlaybackSession.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    await cron.run();
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's1', reason: 'REAPER_TIMEOUT' });
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's2', reason: 'REAPER_TIMEOUT' });
  });

  it('noop when no stale sessions', async () => {
    prisma.raw.videoPlaybackSession.findMany.mockResolvedValue([]);
    await cron.run();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
