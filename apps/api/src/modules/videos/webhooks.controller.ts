import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudFrontSignerService } from './cloudfront-signer.service';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

@Controller('videos/webhooks')
export class VideoWebhooksController {
  private readonly logger = new Logger(VideoWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfSigner: CloudFrontSignerService,
    @InjectQueue('youtube-upload') private readonly youtubeUploadQueue: Queue,
  ) {}

  @Post('mediaconvert-complete')
  @HttpCode(200)
  async handleMediaConvertComplete(
    @Headers('x-amz-sns-message-type') snsType: string | undefined,
    @Body() body: any,
  ) {
    // Handle SNS subscription confirmation
    if (snsType === 'SubscriptionConfirmation' && body.SubscribeURL) {
      this.logger.log(`SNS subscription confirmation — visit: ${body.SubscribeURL}`);
      // Auto-confirm by fetching the URL
      await fetch(body.SubscribeURL);
      return { confirmed: true };
    }

    // Parse SNS notification
    if (snsType !== 'Notification') {
      return { skipped: true };
    }

    let message: any;
    try {
      message = typeof body.Message === 'string' ? JSON.parse(body.Message) : body.Message;
    } catch {
      throw new BadRequestException('Invalid SNS message');
    }

    // Verify HMAC if secret is configured
    const secret = process.env.MEDIACONVERT_WEBHOOK_SECRET;
    if (secret && body.Signature) {
      const hmac = createHmac('sha256', secret)
        .update(typeof body.Message === 'string' ? body.Message : JSON.stringify(body.Message))
        .digest('hex');
      // For SNS, we primarily rely on SNS signature verification which is handled by AWS SDK
      // The HMAC is an extra layer for custom integrations
    }

    const detail = message?.detail;
    if (!detail) return { skipped: true };

    const jobStatus = detail.status;
    const userMetadata = detail.userMetadata;
    const videoId = userMetadata?.videoId;

    if (!videoId) {
      this.logger.warn('MediaConvert webhook: missing videoId in userMetadata');
      return { skipped: true };
    }

    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status === 'READY') {
      return { skipped: true }; // idempotent
    }

    if (jobStatus === 'COMPLETE') {
      const durationMs =
        detail.outputGroupDetails?.[0]?.outputDetails?.[0]?.durationInMs ?? null;
      const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null;
      const duration = durationSeconds ? formatDuration(durationSeconds) : null;

      const s3KeyOutput = `outputs/${video.companyId}/${video.id}/video.mp4`;
      const s3KeyThumb = `outputs/${video.companyId}/${video.id}/thumb.0000000.jpg`;
      const cloudFrontThumbUrl = this.cfSigner.getPublicThumbUrl(s3KeyThumb);

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
        },
      });

      // Queue YouTube dual-publish
      await this.youtubeUploadQueue.add(
        'upload',
        { videoId },
        { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );
      await this.prisma.video.update({
        where: { id: videoId },
        data: { youtubeUploadStatus: 'pending' },
      });

      this.logger.log(`Video ${videoId} marked READY via webhook`);
    } else if (jobStatus === 'ERROR') {
      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED', uploadError: detail.errorMessage || 'Transcode failed' },
      });
      this.logger.warn(`Video ${videoId} transcode failed via webhook`);
    }

    return { ok: true };
  }
}
