import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsController } from './video-sessions.controller';
import { VideoSessionsService } from './video-sessions.service';
import { VisitPlaybackController } from './visit-playback.controller';
import { VisitPlaybackService } from './visit-playback.service';
import { FinalizeWorker } from './workers/finalize.worker';
import { ReaperCron } from './workers/reaper.cron';

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
  controllers: [VideoSessionsController, VisitPlaybackController],
  providers: [PublicLandingGuard, VideoSessionsService, VisitPlaybackService, FinalizeWorker, ReaperCron],
  exports: [VideoSessionsService],
})
export class VideoSessionsModule {}
