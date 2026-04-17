import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { EventTuple } from '@laptopguru-crm/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeAggregates } from '../aggregates/compute-aggregates';
import { computeSecondDeltas } from '../aggregates/compute-second-deltas';

export interface FinalizeJob {
  sessionId: string;
  reason: 'CLIENT_FINAL' | 'REAPER_TIMEOUT';
}

@Processor('video-session-finalize')
export class FinalizeWorker extends WorkerHost {
  private readonly logger = new Logger(FinalizeWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FinalizeJob>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.prisma.raw.videoPlaybackSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        finalized: true,
        trace: true,
        videoId: true,
        videoDurationMs: true,
        endReason: true,
        landingVisitId: true,
      },
    });
    if (!session || session.finalized) return;

    const trace = (session.trace as unknown as EventTuple[]) || [];

    if (trace.length === 0) {
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          finalized: true,
          endReason: session.endReason ?? 'INCOMPLETE',
          durationWatchedMs: 0,
          uniqueSecondsWatched: 0,
          maxPositionMs: 0,
          completionPercent: 0,
          playCount: 0,
          pauseCount: 0,
          seekCount: 0,
          bufferCount: 0,
          bufferTimeMs: 0,
          errorCount: 0,
        },
      });
      return;
    }

    const agg = computeAggregates(trace, session.videoDurationMs);
    const deltas = computeSecondDeltas(trace, session.videoDurationMs);

    await this.prisma.raw.$transaction(async (tx) => {
      await tx.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          finalized: true,
          durationWatchedMs: agg.durationWatchedMs,
          uniqueSecondsWatched: deltas.uniqueSecondsWatched,
          maxPositionMs: agg.maxPositionMs,
          completionPercent: agg.completionPercent,
          playCount: agg.playCount,
          pauseCount: agg.pauseCount,
          seekCount: agg.seekCount,
          bufferCount: agg.bufferCount,
          bufferTimeMs: agg.bufferTimeMs,
          errorCount: agg.errorCount,
        },
      });

      if (deltas.seconds.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "VideoSecondStats" ("videoId", "second", "views", "replays", "pauseCount", "seekAwayCount")
          SELECT ${session.videoId}, sec, v, r, p, sa
          FROM unnest(
            ${deltas.seconds}::int[],
            ${deltas.views}::int[],
            ${deltas.replays}::int[],
            ${deltas.pauses}::int[],
            ${deltas.seekAways}::int[]
          ) AS t(sec, v, r, p, sa)
          ON CONFLICT ("videoId", "second") DO UPDATE
          SET "views"         = "VideoSecondStats"."views"         + EXCLUDED."views",
              "replays"       = "VideoSecondStats"."replays"       + EXCLUDED."replays",
              "pauseCount"    = "VideoSecondStats"."pauseCount"    + EXCLUDED."pauseCount",
              "seekAwayCount" = "VideoSecondStats"."seekAwayCount" + EXCLUDED."seekAwayCount"
        `;
      }

      await tx.landingVisit.update({
        where: { id: session.landingVisitId },
        data: {
          videoPlayed: agg.playCount > 0,
          videoWatchTime: Math.round(agg.durationWatchedMs / 1000),
          videoCompleted: agg.completionPercent >= 0.95,
          videoBufferCount: agg.bufferCount,
          videoBufferTime: agg.bufferTimeMs,
        },
      });
    });

    this.logger.log(`Finalized session ${sessionId}: ${agg.durationWatchedMs}ms watched`);
  }
}
