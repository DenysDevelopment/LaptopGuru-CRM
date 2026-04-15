import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeAggregates } from './compute-aggregates';
import { computeSecondDeltas } from './compute-second-deltas';
import type { EventTuple } from '@laptopguru-crm/shared';

interface FinalizeJobData {
  sessionId: string;
  reason: 'CLIENT_FINAL' | 'REAPER_TIMEOUT';
}

@Processor('video-session-finalize')
@Injectable()
export class FinalizeWorker extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FinalizeJobData>): Promise<void> {
    const { sessionId } = job.data;
    const session = await this.prisma.videoPlaybackSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.finalized) return;

    const trace = (session.trace as unknown as EventTuple[]) ?? [];
    const aggregates = computeAggregates(trace, session.videoDurationMs);
    const deltas = computeSecondDeltas(trace, session.videoDurationMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          finalized: true,
          endedAt: session.endedAt ?? new Date(),
          endReason: session.endReason ?? 'INCOMPLETE',
          durationWatchedMs: aggregates.durationWatchedMs,
          uniqueSecondsWatched: deltas.uniqueSecondsWatched,
          maxPositionMs: aggregates.maxPositionMs,
          completionPercent: aggregates.completionPercent,
          playCount: aggregates.playCount,
          pauseCount: aggregates.pauseCount,
          seekCount: aggregates.seekCount,
          bufferCount: aggregates.bufferCount,
          bufferTimeMs: aggregates.bufferTimeMs,
          errorCount: aggregates.errorCount,
        },
      });

      for (let i = 0; i < deltas.seconds.length; i++) {
        const second = deltas.seconds[i];
        await tx.videoSecondStats.upsert({
          where: { videoId_second: { videoId: session.videoId, second } },
          create: {
            videoId: session.videoId,
            second,
            views: deltas.views[i],
            replays: deltas.replays[i],
            pauseCount: deltas.pauseCount[i],
            seekAwayCount: deltas.seekAwayCount[i],
          },
          update: {
            views: { increment: deltas.views[i] },
            replays: { increment: deltas.replays[i] },
            pauseCount: { increment: deltas.pauseCount[i] },
            seekAwayCount: { increment: deltas.seekAwayCount[i] },
          },
        });
      }

      await tx.landingVisit.update({
        where: { id: session.landingVisitId },
        data: {
          videoPlayed: aggregates.playCount > 0,
          videoWatchTime: Math.round(aggregates.durationWatchedMs / 1000),
          videoCompleted: aggregates.completionPercent >= 0.95,
          videoBufferCount: aggregates.bufferCount,
          videoBufferTime: aggregates.bufferTimeMs,
        },
      });
    });
  }
}
