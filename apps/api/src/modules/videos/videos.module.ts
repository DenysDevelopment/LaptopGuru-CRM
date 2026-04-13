import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VideosController } from './videos.controller';
import { VideoWebhooksController } from './webhooks.controller';
import { VideoAnalyticsController } from './video-analytics.controller';
import { VideosService } from './videos.service';
import { VideoAnalyticsService } from './video-analytics.service';
import { YouTubeSyncProcessor } from './youtube-sync.processor';
import { VideoTranscodePollProcessor } from './video-transcode-poll.processor';
import { VideoTranscodeStartProcessor } from './video-transcode-start.processor';
import { YouTubeUploadProcessor } from './youtube-upload.processor';
import { YouTubeUploadRetryProcessor } from './youtube-upload-retry.processor';
import { AnalyticsCleanupProcessor } from './analytics-cleanup.processor';
import { S3Service } from './s3.service';
import { CloudFrontSignerService } from './cloudfront-signer.service';
import { MediaConvertService } from './mediaconvert.service';
import { YouTubeUploadService } from './youtube-upload.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'youtube-sync' },
      { name: 'video-transcode-poll' },
      { name: 'video-transcode-start' },
      { name: 'youtube-upload' },
      { name: 'youtube-upload-retry' },
      { name: 'analytics-cleanup' },
    ),
  ],
  controllers: [VideosController, VideoWebhooksController, VideoAnalyticsController],
  providers: [
    VideosService,
    VideoAnalyticsService,
    YouTubeSyncProcessor,
    VideoTranscodePollProcessor,
    VideoTranscodeStartProcessor,
    YouTubeUploadProcessor,
    YouTubeUploadRetryProcessor,
    AnalyticsCleanupProcessor,
    S3Service,
    CloudFrontSignerService,
    MediaConvertService,
    YouTubeUploadService,
  ],
  exports: [VideosService, S3Service, CloudFrontSignerService],
})
export class VideosModule implements OnModuleInit {
  constructor(
    @InjectQueue('youtube-sync') private readonly youtubeSyncQueue: Queue,
    @InjectQueue('video-transcode-start') private readonly transcodeStartQueue: Queue,
    @InjectQueue('youtube-upload-retry') private readonly youtubeUploadRetryQueue: Queue,
    @InjectQueue('analytics-cleanup') private readonly analyticsCleanupQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.youtubeSyncQueue.add(
      'sync-all',
      {},
      { repeat: { every: 60 * 60 * 1000 } },
    );

    await this.transcodeStartQueue.add(
      'check',
      {},
      { repeat: { every: 10_000 } },
    );

    await this.youtubeUploadRetryQueue.add(
      'retry-quota-failed',
      {},
      {
        repeat: { pattern: '5 7 * * *', tz: 'UTC' },
        removeOnComplete: true,
      },
    );

    // Cleanup old analytics events daily at 03:00 UTC
    await this.analyticsCleanupQueue.add(
      'cleanup',
      {},
      {
        repeat: { pattern: '0 3 * * *', tz: 'UTC' },
        removeOnComplete: true,
      },
    );
  }
}
