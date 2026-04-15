import { describe, it, expect, beforeEach, vi } from 'vitest';
import Redis from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let redis: InstanceType<typeof Redis>;
  let service: RateLimitService;

  beforeEach(() => {
    redis = new Redis();
    service = new RateLimitService(redis as unknown as import('ioredis').Redis);
  });

  it('allows the first request', async () => {
    await expect(service.check('k', 5, 60)).resolves.toBe(true);
  });

  it('allows up to `limit` requests within the window', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(service.check('k', 5, 60)).resolves.toBe(true);
    }
  });

  it('rejects the limit+1 request', async () => {
    for (let i = 0; i < 5; i++) await service.check('k', 5, 60);
    await expect(service.check('k', 5, 60)).resolves.toBe(false);
  });

  it('does not cross-contaminate keys', async () => {
    for (let i = 0; i < 5; i++) await service.check('a', 5, 60);
    await expect(service.check('b', 5, 60)).resolves.toBe(true);
  });

  it('resets after window expires (sliding)', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-04-14T00:00:00Z');
    vi.setSystemTime(start);
    for (let i = 0; i < 5; i++) await service.check('k', 5, 60);
    vi.setSystemTime(new Date(start.getTime() + 61_000));
    await expect(service.check('k', 5, 60)).resolves.toBe(true);
    vi.useRealTimers();
  });
});
