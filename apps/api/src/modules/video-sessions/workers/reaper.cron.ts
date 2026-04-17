import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ReaperCron {
  private readonly logger = new Logger(ReaperCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly queue: Queue,
  ) {}

  @Cron('*/5 * * * *')
  async run() {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const stale = await this.prisma.raw.videoPlaybackSession.findMany({
      where: { finalized: false, endedAt: null, updatedAt: { lt: cutoff } },
      take: 100,
      select: { id: true },
    });

    for (const { id } of stale) {
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'INCOMPLETE' },
      });
      await this.queue.add('finalize', { sessionId: id, reason: 'REAPER_TIMEOUT' });
    }

    if (stale.length > 0) this.logger.log(`Reaped ${stale.length} stale sessions`);
  }
}
