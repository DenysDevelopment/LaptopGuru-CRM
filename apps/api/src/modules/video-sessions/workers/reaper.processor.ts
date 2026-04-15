import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('video-session-reaper')
@Injectable()
export class ReaperProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const stale = await this.prisma.videoPlaybackSession.findMany({
      where: {
        finalized: false,
        endedAt: null,
        updatedAt: { lt: cutoff },
      },
      take: 100,
      select: { id: true },
    });

    for (const { id } of stale) {
      await this.prisma.videoPlaybackSession.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'INCOMPLETE' },
      });
      await this.finalizeQueue.add(
        'finalize',
        { sessionId: id, reason: 'REAPER_TIMEOUT' },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      );
    }
  }
}
