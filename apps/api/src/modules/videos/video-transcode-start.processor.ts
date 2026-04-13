import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaConvertService } from './mediaconvert.service';

@Processor('video-transcode-start')
export class VideoTranscodeStartProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoTranscodeStartProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaConvertService: MediaConvertService,
    @InjectQueue('video-transcode-poll') private readonly pollQueue: Queue,
    @InjectQueue('youtube-upload') private readonly youtubeUploadQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    // Find videos that need transcode: PROCESSING but no mediaConvertJobId
    const videos = await this.prisma.video.findMany({
      where: {
        source: 'S3',
        status: 'PROCESSING',
        mediaConvertJobId: null,
        s3KeyOriginal: { not: null },
      },
      take: 5,
    });

    for (const video of videos) {
      try {
        const jobId = await this.mediaConvertService.createTranscodeJob({
          videoId: video.id,
          companyId: video.companyId,
          inputKey: video.s3KeyOriginal!,
        });

        await this.prisma.video.update({
          where: { id: video.id },
          data: { mediaConvertJobId: jobId },
        });

        // Add polling job as fallback for webhook
        await this.pollQueue.add(
          'poll',
          { videoId: video.id, mediaConvertJobId: jobId },
          {
            delay: 30_000,
            attempts: 120,
            backoff: { type: 'fixed', delay: 30_000 },
          },
        );

        this.logger.log(`Started transcode for video ${video.id}, job ${jobId}`);
      } catch (err) {
        this.logger.error(
          `Failed to start transcode for video ${video.id}: ${err instanceof Error ? err.message : err}`,
        );
        await this.prisma.video.update({
          where: { id: video.id },
          data: { status: 'FAILED', uploadError: `Transcode start failed: ${err instanceof Error ? err.message : err}` },
        });
      }
    }

    // Catch-up: find READY videos that need YouTube upload but were missed
    const pendingYoutube = await this.prisma.video.findMany({
      where: {
        source: 'S3',
        status: 'READY',
        publishToYoutube: true,
        youtubeUploadStatus: null,
        s3KeyOriginal: { not: null },
      },
      take: 5,
    });

    for (const v of pendingYoutube) {
      try {
        await this.youtubeUploadQueue.add(
          'upload',
          { videoId: v.id },
          {
            jobId: `yt-upload-${v.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
          },
        );
        await this.prisma.video.update({
          where: { id: v.id },
          data: { youtubeUploadStatus: 'pending' },
        });
        this.logger.log(`Catch-up: queued YouTube upload for video ${v.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to queue YouTube upload for video ${v.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
