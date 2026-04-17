import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';
import type { RedisProvider } from './redis-provider.service';

describe('RateLimitService', () => {
  let service: RateLimitService;

  beforeEach(() => {
    const client = new Redis();
    const provider = { client } as unknown as RedisProvider;
    service = new RateLimitService(provider);
  });

  it('allows requests up to the limit', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await service.check('k', 10, 60)).toBe(true);
    }
  });

  it('rejects the request that exceeds the limit', async () => {
    for (let i = 0; i < 10; i++) await service.check('k', 10, 60);
    expect(await service.check('k', 10, 60)).toBe(false);
  });

  it('resets via sliding window after time advances', async () => {
    for (let i = 0; i < 10; i++) await service.check('k', 10, 1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await service.check('k', 10, 1)).toBe(true);
  });

  it('isolates keys', async () => {
    for (let i = 0; i < 10; i++) await service.check('a', 10, 60);
    expect(await service.check('b', 10, 60)).toBe(true);
  });
});
