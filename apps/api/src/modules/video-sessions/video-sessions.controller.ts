import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicLandingEndpoint } from '../../common/decorators/public-landing-endpoint.decorator';
import { PublicLandingGuard, PublicLandingContext } from '../../common/guards/public-landing.guard';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { VideoSessionsService } from './video-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AppendChunkDto } from './dto/append-chunk.dto';

interface PublicRequest extends Request {
  publicContext?: PublicLandingContext;
}

@Controller('public/video-sessions')
export class VideoSessionsController {
  constructor(
    private readonly service: VideoSessionsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  @PublicLandingEndpoint()
  @UseGuards(PublicLandingGuard)
  @HttpCode(200)
  async create(@Req() req: PublicRequest, @Body() dto: CreateSessionDto) {
    const ctx = req.publicContext!;
    const ok = await this.rateLimit.check(`rl:session-create:${ctx.visitId}`, 10, 60);
    if (!ok) throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);

    return this.service.createSession({
      companyId: ctx.companyId,
      landingId: ctx.landingId,
      visitId: ctx.visitId,
      videoId: ctx.videoId,
      videoDurationMs: dto.videoDurationMs,
      clientStartedAt: dto.clientStartedAt,
    });
  }

  @Post(':sessionId/chunks')
  @PublicLandingEndpoint()
  @HttpCode(202)
  async appendChunk(@Param('sessionId') sessionId: string, @Body() body: AppendChunkDto) {
    const ok = await this.rateLimit.check(`rl:chunk:${sessionId}`, 120, 60);
    if (!ok) throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);
    return this.service.appendChunk(sessionId, body);
  }

  @Post(':sessionId/chunks/beacon')
  @PublicLandingEndpoint()
  async appendChunkBeacon(
    @Param('sessionId') sessionId: string,
    @Req() req: PublicRequest,
    @Res() res: Response,
    @Headers('content-type') contentType?: string,
  ) {
    let body: AppendChunkDto;
    try {
      if (contentType?.includes('text/plain') && typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body as AppendChunkDto;
      }
    } catch {
      res.status(204).end();
      return;
    }
    try {
      await this.service.appendChunk(sessionId, body);
    } catch {
      // beacon is fire-and-forget: swallow errors so the browser doesn't retry
    }
    res.status(204).end();
  }
}
