import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';

@Module({
  imports: [BullModule.registerQueue({ name: 'video-session-finalize' })],
  providers: [PublicLandingGuard],
  exports: [],
})
export class VideoSessionsModule {}
