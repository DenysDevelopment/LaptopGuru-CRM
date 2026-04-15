import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EventCode } from '@laptopguru-crm/shared';

const MAX_EVENTS_PER_CHUNK = 500;
const VALID_END_REASONS = new Set([
  'ENDED', 'PAUSED_LONG', 'CLOSED', 'NAVIGATED', 'ERROR', 'INCOMPLETE',
]);
const VALID_EVENT_CODES = new Set(
  Object.values(EventCode).filter((v) => typeof v === 'number') as number[],
);

export interface CreateSessionArgs {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
  videoDurationMs: number;
  clientStartedAt?: number;
}

@Injectable()
export class VideoSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
  ) {}

  async createSession(args: CreateSessionArgs): Promise<{ sessionId: string }> {
    const startedAt = new Date(args.clientStartedAt ?? Date.now());
    const existing = await this.prisma.videoPlaybackSession.findFirst({
      where: {
        landingVisitId: args.visitId,
        videoId: args.videoId,
        startedAt,
      },
    });
    if (existing) return { sessionId: existing.id };

    const created = await this.prisma.videoPlaybackSession.create({
      data: {
        landingVisitId: args.visitId,
        videoId: args.videoId,
        companyId: args.companyId,
        videoDurationMs: args.videoDurationMs,
        startedAt,
      },
    });
    return { sessionId: created.id };
  }

  async appendChunk(
    sessionId: string,
    body: { seq: number; events: unknown[]; final: boolean; endReason?: string },
  ): Promise<{ status: 'appended' | 'deduped' }> {
    const session = await this.prisma.videoPlaybackSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('session not found');
    if (session.finalized) throw new GoneException('session finalized');

    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('events must be a non-empty array');
    }
    if (events.length > MAX_EVENTS_PER_CHUNK) {
      throw new BadRequestException(`max ${MAX_EVENTS_PER_CHUNK} events per chunk`);
    }

    const nowMs = Date.now();
    const maxPos = session.videoDurationMs + 1000;
    for (const ev of events) {
      if (!Array.isArray(ev) || ev.length < 3 || ev.length > 4) {
        throw new BadRequestException('malformed event tuple');
      }
      const [tMs, code, pos] = ev as [unknown, unknown, unknown];
      if (typeof tMs !== 'number' || tMs < 0 || tMs > nowMs + 60_000) {
        throw new BadRequestException('invalid tMs');
      }
      if (typeof code !== 'number' || !VALID_EVENT_CODES.has(code)) {
        throw new BadRequestException('invalid event code');
      }
      if (typeof pos !== 'number' || pos < 0 || pos > maxPos) {
        throw new BadRequestException('pos out of range');
      }
    }

    if (body.final && body.endReason !== undefined && !VALID_END_REASONS.has(body.endReason)) {
      throw new BadRequestException('invalid endReason');
    }

    try {
      await this.prisma.videoSessionChunk.create({
        data: { sessionId, seq: body.seq },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        return { status: 'deduped' };
      }
      throw err;
    }

    await this.prisma.$executeRaw`
      UPDATE "VideoPlaybackSession"
      SET "trace" = "trace" || ${JSON.stringify(events)}::jsonb,
          "chunksReceived" = "chunksReceived" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${sessionId}
    `;

    if (body.final) {
      await this.prisma.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          endReason: (body.endReason as 'CLOSED') ?? 'CLOSED',
        },
      });
      await this.finalizeQueue.add(
        'finalize',
        { sessionId, reason: 'CLIENT_FINAL' },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      );
    }

    return { status: 'appended' };
  }
}
