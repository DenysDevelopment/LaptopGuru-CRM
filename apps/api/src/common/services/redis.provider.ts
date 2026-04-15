import { Provider } from '@nestjs/common';
import IORedis from 'ioredis';
import { REDIS_CLIENT } from './rate-limit.service';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }),
};
