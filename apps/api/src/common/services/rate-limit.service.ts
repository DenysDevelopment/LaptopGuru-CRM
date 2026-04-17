import { Injectable, Logger } from '@nestjs/common';
import { RedisProvider } from './redis-provider.service';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisProvider) {}

  async check(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    const member = `${now}:${Math.random()}`;

    try {
      const pipe = this.redis.client.pipeline();
      pipe.zremrangebyscore(key, 0, windowStart);
      pipe.zadd(key, now, member);
      pipe.zcard(key);
      pipe.expire(key, windowSec);
      const results = await pipe.exec();
      if (!results) return true;
      const countResult = results[2];
      const count = Array.isArray(countResult) ? (countResult[1] as number) : 0;
      return count <= limit;
    } catch (err) {
      // Fail open per spec §7.6 — rate limiter must never break the request path.
      this.logger.warn(
        `Rate limit check failed for key=${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }
}
