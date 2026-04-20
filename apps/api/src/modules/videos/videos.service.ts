import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { S3Service } from './s3.service';
import { MediaConvertService } from './mediaconvert.service';
import { CloudFrontSignerService } from './cloudfront-signer.service';
import type { UploadInitResponse } from '@laptopguru-crm/shared';

import {
  extractYoutubeId,
  fetchChannelInfo,
  fetchChannelVideos,
  fetchVideoInfo,
  normalizeChannelHandle,
} from './youtube-api';

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly s3Service: S3Service,
    private readonly mediaConvertService: MediaConvertService,
    private readonly cfSigner: CloudFrontSignerService,
    @InjectQueue('video-transcode-poll') private readonly transcodePollQueue: Queue,
  ) {}

  /** List all active videos for current company, newest first. */
  async findAll() {
    const companyId = this.cls.get<string>('companyId');
    const videos = await this.prisma.video.findMany({
      where: { active: true, companyId },
      orderBy: { createdAt: 'desc' },
    });
    return videos.map((v) => ({
      ...v,
      thumbnail: v.s3KeyThumb ? this.cfSigner.signVideoUrl(v.s3KeyThumb) : v.thumbnail,
      cloudFrontThumbUrl: v.s3KeyThumb ? this.cfSigner.signVideoUrl(v.s3KeyThumb) : v.cloudFrontThumbUrl,
    }));
  }

  /** Add a YouTube video by URL (or re-activate if soft-deleted). */
  async addVideo(url: string, userId: string) {
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    const companyId = this.cls.get<string>('companyId');

    const existing = await this.prisma.video.findUnique({
      where: { youtubeId_companyId: { youtubeId, companyId } },
    });
    if (existing) {
      if (!existing.active) {
        return this.prisma.video.update({
          where: { id: existing.id },
          data: { active: true },
        });
      }
      throw new ConflictException('Video already added');
    }

    const info = await fetchVideoInfo(youtubeId);

    return this.prisma.video.create({
      data: {
        youtubeId: info.youtubeId,
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        channelTitle: info.channelTitle,
        userId,
        companyId,
      },
    });
  }

  /** Soft-delete a video by setting active to false. For S3 videos, also clean up S3 objects. */
  async remove(id: string) {
    const companyId = this.cls.get<string>('companyId');
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.companyId !== companyId) {
      throw new NotFoundException('Video not found');
    }

    if (video.source === 'S3') {
      const prefixes = [
        `originals/${companyId}/${id}.mp4`,
        `outputs/${companyId}/${id}/`,
      ];
      for (const p of prefixes) {
        try {
          if (p.endsWith('/')) {
            await this.s3Service.deleteRecursive(p);
          } else {
            await this.s3Service.deleteObject(p);
          }
        } catch (err) {
          this.logger.warn(`Failed to delete S3 object ${p}: ${err}`);
        }
      }
    }

    await this.prisma.video.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }

  /** Step 1 of S3 upload: create Video row + presigned PUT URL. */
  async createUploadInit(
    dto: { fileName: string; fileSize: number; mimeType: string; title: string },
    userId: string,
  ): Promise<UploadInitResponse> {
    const companyId = this.cls.get<string>('companyId');
    const maxBytes = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);

    if (dto.fileSize > maxBytes) {
      throw new BadRequestException('File too large');
    }
    if (!dto.mimeType.startsWith('video/')) {
      throw new BadRequestException('Only video files accepted');
    }

    const video = await this.prisma.video.create({
      data: {
        source: 'S3',
        status: 'UPLOADING',
        title: dto.title,
        thumbnail: '',
        mimeType: dto.mimeType,
        fileSize: BigInt(dto.fileSize),
        s3Bucket: process.env.AWS_S3_VIDEO_BUCKET || '',
        userId,
        companyId,
      },
    });

    const key = `originals/${companyId}/${video.id}.mp4`;

    const putUrl = await this.s3Service.createPresignedPutUrl({
      key,
      contentType: dto.mimeType,
      ttlSeconds: Number(process.env.VIDEO_PRESIGN_TTL_SECONDS || 900),
    });

    await this.prisma.video.update({
      where: { id: video.id },
      data: { s3KeyOriginal: key },
    });

    return { videoId: video.id, putUrl, key };
  }

  /** Step 2 of S3 upload: verify the file landed in S3, set status PROCESSING or READY. */
  async createUploadComplete(videoId: string): Promise<{ ok: true }> {
    const companyId = this.cls.get<string>('companyId');
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });

    if (!video || video.companyId !== companyId) throw new NotFoundException();
    if (video.status !== 'UPLOADING') return { ok: true };
    if (!video.s3KeyOriginal) throw new BadRequestException('Missing s3KeyOriginal');

    try {
      const head = await this.s3Service.headObject(video.s3KeyOriginal);
      const maxBytes = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);
      if (head.ContentLength && Number(head.ContentLength) > maxBytes) {
        await this.s3Service.deleteObject(video.s3KeyOriginal);
        await this.prisma.video.update({
          where: { id: videoId },
          data: { status: 'FAILED', uploadError: 'File too large' },
        });
        throw new BadRequestException('File too large');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED', uploadError: 'Upload verification failed' },
      });
      throw err;
    }

    // Start MediaConvert transcode job
    const mediaConvertJobId = await this.mediaConvertService.createTranscodeJob({
      videoId,
      companyId,
      inputKey: video.s3KeyOriginal,
    });

    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', mediaConvertJobId },
    });

    // Fallback polling in case SNS webhook doesn't arrive
    await this.transcodePollQueue.add(
      'poll',
      { videoId, mediaConvertJobId },
      {
        delay: 30_000,
        attempts: 120, // 120 × 30s = 60 min
        backoff: { type: 'fixed', delay: 30_000 },
      },
    );

    return { ok: true };
  }

  async getYoutubeChannel() {
    const companyId = this.cls.get<string>('companyId');
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { youtubeChannelHandle: true, youtubeLastSyncAt: true },
    });
    if (!company?.youtubeChannelHandle) return null;
    try {
      const info = await fetchChannelInfo(company.youtubeChannelHandle);
      return {
        handle: company.youtubeChannelHandle,
        channelTitle: info.title,
        thumbnail: info.thumbnail,
        lastSyncAt: company.youtubeLastSyncAt,
      };
    } catch {
      return {
        handle: company.youtubeChannelHandle,
        channelTitle: null,
        thumbnail: null,
        lastSyncAt: company.youtubeLastSyncAt,
      };
    }
  }

  async updateYoutubeChannel(handleInput: string) {
    const handle = normalizeChannelHandle(handleInput);
    const info = await fetchChannelInfo(handle);
    const companyId = this.cls.get<string>('companyId');
    await this.prisma.company.update({
      where: { id: companyId },
      data: { youtubeChannelHandle: handle },
    });
    return { handle, channelTitle: info.title, thumbnail: info.thumbnail };
  }

  async removeYoutubeChannel() {
    const companyId = this.cls.get<string>('companyId');
    await this.prisma.company.update({
      where: { id: companyId },
      data: { youtubeChannelHandle: null, youtubeLastSyncAt: null },
    });
    return { ok: true };
  }

  /** Sync all videos from the configured YouTube channel. */
  async syncFromChannel(userId: string) {
    const companyId = this.cls.get<string>('companyId');
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { youtubeChannelHandle: true },
    });
    if (!company?.youtubeChannelHandle) {
      throw new BadRequestException('No YouTube channel connected');
    }
    try {
      const videos = await fetchChannelVideos(company.youtubeChannelHandle);
      let imported = 0;
      for (const video of videos) {
        const existing = await this.prisma.video.findUnique({
          where: { youtubeId_companyId: { youtubeId: video.youtubeId, companyId } },
        });
        if (existing) {
          if (!existing.active) {
            await this.prisma.video.update({
              where: { id: existing.id },
              data: { active: true },
            });
            imported++;
          }
          continue;
        }
        await this.prisma.video.create({
          data: {
            youtubeId: video.youtubeId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
            channelTitle: video.channelTitle,
            userId,
            companyId,
          },
        });
        imported++;
      }
      await this.prisma.company.update({
        where: { id: companyId },
        data: { youtubeLastSyncAt: new Date() },
      });
      return { imported, total: videos.length };
    } catch (error) {
      this.logger.error('Video sync failed', error);
      throw new InternalServerErrorException('Video sync failed');
    }
  }
}
