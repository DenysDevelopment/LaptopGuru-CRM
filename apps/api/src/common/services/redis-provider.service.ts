import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisProvider implements OnModuleDestroy {
  private readonly logger = new Logger(RedisProvider.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.warn(
        `Redis quit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
