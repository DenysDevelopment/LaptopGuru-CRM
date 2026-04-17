import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import type { PublicContext } from '../../common/guards/public-landing.guard';

@Injectable()
export class VideoSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createSession(
    ctx: PublicContext,
    body: { videoDurationMs: number; clientStartedAt: string },
  ): Promise<{ sessionId: string }> {
    const okRate = await this.rateLimit.check(
      `ratelimit:session-create:${ctx.visitId}`,
      10,
      60,
    );
    if (!okRate) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);

    const startedAt = new Date(body.clientStartedAt);
    if (Number.isNaN(startedAt.getTime())) throw new BadRequestException('Invalid clientStartedAt');

    const now = Date.now();
    const ageMs = now - startedAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000 || ageMs < -5 * 60 * 1000) {
      throw new BadRequestException('clientStartedAt out of allowed window');
    }

    const row = await this.prisma.raw.videoPlaybackSession.upsert({
      where: {
        landingVisitId_videoId_startedAt: {
          landingVisitId: ctx.visitId,
          videoId: ctx.videoId,
          startedAt,
        },
      },
      update: {},
      create: {
        landingVisitId: ctx.visitId,
        videoId: ctx.videoId,
        companyId: ctx.companyId,
        startedAt,
        videoDurationMs: body.videoDurationMs,
      },
      select: { id: true },
    });
    return { sessionId: row.id };
  }

  // appendChunk is implemented in Task 8
}
