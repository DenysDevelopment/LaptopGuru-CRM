import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('analytics-cleanup')
export class AnalyticsCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsCleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    const result = await this.prisma.videoWatchEvent.deleteMany({
      where: { serverTimestamp: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} old VideoWatchEvent rows (older than 90 days)`);
    }
  }
}
