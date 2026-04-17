import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsController } from './video-sessions.controller';
import { VideoSessionsService } from './video-sessions.service';
import { FinalizeWorker } from './workers/finalize.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-session-finalize',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [VideoSessionsController],
  providers: [PublicLandingGuard, VideoSessionsService, FinalizeWorker],
  exports: [VideoSessionsService],
})
export class VideoSessionsModule {}
