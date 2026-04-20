import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { fetchChannelVideos } from './youtube-api';

@Processor('youtube-sync')
export class YouTubeSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(YouTubeSyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Starting YouTube sync for all companies...');

    const companies = await this.prisma.company.findMany({
      where: {
        youtubeChannelHandle: { not: null },
        isActive: true,
      },
      select: { id: true, youtubeChannelHandle: true },
    });

    if (companies.length === 0) {
      this.logger.log('No companies with YouTube channels configured');
      return;
    }

    let totalImported = 0;

    for (const company of companies) {
      if (!company.youtubeChannelHandle) continue;

      try {
        const videos = await fetchChannelVideos(company.youtubeChannelHandle);
        let imported = 0;

        for (const video of videos) {
          const existing = await this.prisma.video.findUnique({
            where: {
              youtubeId_companyId: {
                youtubeId: video.youtubeId,
                companyId: company.id,
              },
            },
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

          const adminUser = await this.prisma.user.findFirst({
            where: { companyId: company.id, role: 'ADMIN' },
            select: { id: true },
          });

          await this.prisma.video.create({
            data: {
              youtubeId: video.youtubeId,
              title: video.title,
              thumbnail: video.thumbnail,
              duration: video.duration,
              channelTitle: video.channelTitle,
              userId: adminUser?.id ?? '',
              companyId: company.id,
            },
          });
          imported++;
        }

        await this.prisma.company.update({
          where: { id: company.id },
          data: { youtubeLastSyncAt: new Date() },
        });

        if (imported > 0) {
          this.logger.log(
            `Company ${company.id}: imported ${imported} new videos from ${company.youtubeChannelHandle}`,
          );
        }
        totalImported += imported;
      } catch (error) {
        this.logger.warn(
          `Failed to sync YouTube for company ${company.id} (${company.youtubeChannelHandle}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(
      `YouTube sync complete: ${companies.length} companies, ${totalImported} new videos`,
    );
  }
}
