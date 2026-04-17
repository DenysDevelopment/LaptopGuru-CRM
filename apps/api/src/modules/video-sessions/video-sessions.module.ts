import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsService } from './video-sessions.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'video-session-finalize' })],
  providers: [PublicLandingGuard, VideoSessionsService],
  exports: [VideoSessionsService],
})
export class VideoSessionsModule {}
