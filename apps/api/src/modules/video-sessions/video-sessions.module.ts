import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { redisProvider } from '../../common/services/redis.provider';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsController } from './video-sessions.controller';
import { VideoSessionsService } from './video-sessions.service';
import { FinalizeWorker } from './workers/finalize.worker';
import { ReaperProcessor } from './workers/reaper.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'video-session-finalize' },
      { name: 'video-session-reaper' },
    ),
  ],
  controllers: [VideoSessionsController],
  providers: [
    VideoSessionsService,
    FinalizeWorker,
    ReaperProcessor,
    PublicLandingGuard,
    RateLimitService,
    redisProvider,
  ],
  exports: [VideoSessionsService],
})
export class VideoSessionsModule implements OnModuleInit {
  constructor(
    @InjectQueue('video-session-reaper') private readonly reaperQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.reaperQueue.add(
      'reap',
      {},
      { repeat: { pattern: '*/5 * * * *' }, removeOnComplete: true, removeOnFail: true },
    );
  }
}
