import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaConvertService } from './mediaconvert.service';
import { CloudFrontSignerService } from './cloudfront-signer.service';
import { S3Service } from './s3.service';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TranscodePollData {
  videoId: string;
  mediaConvertJobId: string;
}

@Processor('video-transcode-poll')
export class VideoTranscodePollProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoTranscodePollProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaConvertService: MediaConvertService,
    private readonly cfSigner: CloudFrontSignerService,
    private readonly s3Service: S3Service,
    @InjectQueue('youtube-upload') private readonly youtubeUploadQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<TranscodePollData>): Promise<void> {
    const { videoId, mediaConvertJobId } = job.data;

    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status === 'READY') return; // already handled (e.g. by webhook)

    const result = await this.mediaConvertService.getJob(mediaConvertJobId);
    const status = result.Job?.Status;

    if (status === 'COMPLETE') {
      const durationMs =
        result.Job?.OutputGroupDetails?.[0]?.OutputDetails?.[0]?.DurationInMs ?? null;
      const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null;
      const duration = durationSeconds ? formatDuration(durationSeconds) : null;

      // MediaConvert output = {destination}{inputBaseName}{NameModifier}.{ext}
      // Input key: originals/{companyId}/{videoId}.mp4 → baseName = videoId
      const inputBase = (video.s3KeyOriginal ?? '').split('/').pop()?.replace(/\.[^.]+$/, '') || video.id;
      const s3KeyOutput = `outputs/${video.companyId}/${video.id}/${inputBase}video.mp4`;
      const s3KeyThumb = `outputs/${video.companyId}/${video.id}/${inputBase}thumb.0000000.jpg`;
      const cloudFrontThumbUrl = this.cfSigner.getPublicThumbUrl(s3KeyThumb);

      // Replace fileSize (originally set to the uploaded source size) with
      // the transcoded MP4 size so the dashboard shows what customers
      // actually download. Non-fatal if the head call fails — we fall back
      // to the original source size.
      let transcodedSize: bigint | null = null;
      try {
        const head = await this.s3Service.headObject(s3KeyOutput);
        if (head.ContentLength) {
          transcodedSize = BigInt(head.ContentLength);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to read transcoded size for ${videoId}: ${err instanceof Error ? err.message : err}`,
        );
      }

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          s3KeyOutput,
          s3KeyThumb,
          cloudFrontThumbUrl,
          thumbnail: cloudFrontThumbUrl,
          durationSeconds,
          duration,
          ...(transcodedSize !== null && { fileSize: transcodedSize }),
        },
      });

      // Queue YouTube dual-publish (only if opted in)
      if (video.publishToYoutube) {
        await this.youtubeUploadQueue.add(
          'upload',
          { videoId },
          {
            jobId: `yt-upload-${videoId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
          },
        );
        await this.prisma.video.update({
          where: { id: videoId },
          data: { youtubeUploadStatus: 'pending' },
        });
      }

      this.logger.log(`Video ${videoId} transcode complete`);
      return;
    }

    if (status === 'ERROR') {
      const errorMsg =
        result.Job?.ErrorMessage || 'MediaConvert job failed';
      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED', uploadError: errorMsg },
      });
      this.logger.warn(`Video ${videoId} transcode failed: ${errorMsg}`);
      return;
    }

    // Still in progress — throw to trigger retry with delay
    throw new Error(`Job ${mediaConvertJobId} still ${status}, retrying...`);
  }
}
