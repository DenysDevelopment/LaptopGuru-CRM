import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, member);
    pipe.zcard(key);
    pipe.expire(key, windowSec);
    const result = await pipe.exec();
    if (!result) return true;
    const count = result[2]?.[1] as number | undefined;
    if (typeof count !== 'number') return true;
    return count <= limit;
  }
}
