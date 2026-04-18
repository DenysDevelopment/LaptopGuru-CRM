import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RedisProvider } from './redis-provider.service';

@Global()
@Module({
  providers: [RedisProvider, RateLimitService],
  exports: [RedisProvider, RateLimitService],
})
export class CommonServicesModule {}
