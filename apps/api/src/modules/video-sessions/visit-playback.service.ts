import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeTrace, type EventTuple, type VisitPlaybackData } from '@laptopguru-crm/shared';

@Injectable()
export class VisitPlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  async getForVisit(slug: string, visitId: string, companyId: string | null): Promise<VisitPlaybackData> {
    const visit = await this.prisma.raw.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        companyId: true,
        landing: { select: { slug: true, videoId: true } },
        playbackSessions: {
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            endReason: true,
            videoDurationMs: true,
            durationWatchedMs: true,
            completionPercent: true,
            trace: true,
          },
        },
      },
    });

    if (!visit || visit.landing.slug !== slug) throw new NotFoundException();
    if (companyId && visit.companyId !== companyId) throw new NotFoundException();

    return {
      visitId: visit.id,
      videoId: visit.landing.videoId,
      sessions: visit.playbackSessions.map((s) => ({
        sessionId: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        endReason: s.endReason ?? null,
        videoDurationMs: s.videoDurationMs,
        durationWatchedMs: s.durationWatchedMs ?? 0,
        completionPercent: s.completionPercent ?? 0,
        events: decodeTrace((s.trace as unknown as EventTuple[]) || []),
      })),
    };
  }
}
