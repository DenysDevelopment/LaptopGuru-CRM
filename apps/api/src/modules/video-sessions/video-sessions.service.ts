import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import type { PublicContext } from '../../common/guards/public-landing.guard';
import type { EndReason } from './dto/append-chunk.dto';

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

  async appendChunk(
    ctx: PublicContext,
    body: {
      seq: number;
      events: unknown[];
      final: boolean;
      endReason?: EndReason;
    },
    opts: { beacon: boolean },
  ): Promise<{ deduped?: true; accepted?: true }> {
    if (!ctx.sessionId) throw new BadRequestException('Missing sessionId');

    if (!opts.beacon) {
      const ok = await this.rateLimit.check(`ratelimit:chunk:${ctx.sessionId}`, 120, 60);
      if (!ok) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    } else {
      // Flood guard by visit even for beacons
      const ok = await this.rateLimit.check(`ratelimit:beacon:${ctx.visitId}`, 300, 60);
      if (!ok) return { accepted: true }; // swallow: beacons cannot retry
    }

    const session = await this.prisma.raw.videoPlaybackSession.findUnique({
      where: { id: ctx.sessionId },
      select: { id: true, finalized: true, videoDurationMs: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.finalized) throw new HttpException('Session already finalized', HttpStatus.GONE);

    // Validate events. Each must be a tuple [tMs: number, type: number 0..14, pos: number, extra?].
    const now = Date.now();
    const maxPos = session.videoDurationMs + 1000;
    const validated: unknown[] = [];
    for (const raw of body.events) {
      if (!Array.isArray(raw) || raw.length < 3 || raw.length > 4) {
        throw new BadRequestException('Malformed event tuple');
      }
      const [tMs, type, pos, extra] = raw as [unknown, unknown, unknown, unknown?];
      if (
        typeof tMs !== 'number' || !Number.isFinite(tMs) || tMs < 0 || tMs > now + 60_000 ||
        typeof type !== 'number' || !Number.isInteger(type) || type < 0 || type > 14 ||
        typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0 || pos > maxPos
      ) {
        throw new BadRequestException('Invalid event values');
      }
      // ERROR messages truncated to 500 chars.
      if (type === 12 && extra && typeof extra === 'object') {
        const msg = (extra as { message?: unknown }).message;
        if (typeof msg === 'string') {
          // Postgres JSONB cannot store \u0000; strip before truncate.
          (extra as { message: string }).message = msg.replace(/\u0000/g, '').slice(0, 500);
        }
      }
      validated.push(raw);
    }

    // Storage-layer dedup: insert the chunk row first; on unique conflict, swallow.
    try {
      await this.prisma.raw.videoSessionChunk.create({
        data: { sessionId: ctx.sessionId, seq: body.seq },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { deduped: true };
      throw e;
    }

    // Append to trace + bump counters. Use raw SQL for JSONB concat.
    await this.prisma.raw.$executeRaw`
      UPDATE "VideoPlaybackSession"
      SET "trace" = "trace" || ${JSON.stringify(validated)}::jsonb,
          "chunksReceived" = "chunksReceived" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${ctx.sessionId}
    `;

    if (body.final) {
      // Enqueue BEFORE the DB update. If the enqueue fails (Redis blip), the
      // reaper can still find this session (endedAt still null → matches its
      // cutoff query). If the enqueue succeeds and the subsequent update
      // fails, the worker's finalized-check + endedAt-null tolerance handles
      // it — see FinalizeWorker (Task 12).
      await this.finalizeQueue.add('finalize', { sessionId: ctx.sessionId, reason: 'CLIENT_FINAL' });
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id: ctx.sessionId },
        data: {
          endedAt: new Date(),
          endReason: (body.endReason as EndReason | undefined) ?? 'CLOSED',
        },
      });
    }

    return { accepted: true };
  }
}
