import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('youtube-upload-retry')
export class YouTubeUploadRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(YouTubeUploadRetryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('youtube-upload') private readonly uploadQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const now = new Date();

    const videos = await this.prisma.video.findMany({
      where: {
        youtubeUploadStatus: 'quota_exceeded',
        youtubeQuotaRetryAt: { lte: now },
      },
      select: { id: true },
    });

    for (const video of videos) {
      await this.prisma.video.update({
        where: { id: video.id },
        data: { youtubeUploadStatus: 'pending', youtubeUploadError: null, youtubeQuotaRetryAt: null },
      });

      await this.uploadQueue.add('upload', { videoId: video.id }, {
        jobId: `yt-upload-${video.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      });

      this.logger.log(`Retrying YouTube upload for video ${video.id}`);
    }

    if (videos.length > 0) {
      this.logger.log(`Queued ${videos.length} YouTube upload retries`);
    }
  }
}
