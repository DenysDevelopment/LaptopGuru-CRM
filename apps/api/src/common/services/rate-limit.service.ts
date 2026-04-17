import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    const member = `${now}:${Math.random()}`;

    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, member);
    pipe.zcard(key);
    pipe.expire(key, windowSec);
    const results = await pipe.exec();
    if (!results) return true;
    const countResult = results[2];
    const count = Array.isArray(countResult) ? (countResult[1] as number) : 0;
    return count <= limit;
  }
}
