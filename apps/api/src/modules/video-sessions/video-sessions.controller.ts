import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PublicLandingEndpoint } from '../../common/decorators/public-landing-endpoint.decorator';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsService } from './video-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AppendChunkDto } from './dto/append-chunk.dto';

@ApiTags('Video Sessions (public)')
@Controller('public/video-sessions')
@UseGuards(PublicLandingGuard)
@SkipThrottle()
export class VideoSessionsController {
  constructor(private readonly service: VideoSessionsService) {}

  @Post()
  @PublicLandingEndpoint()
  @HttpCode(200)
  create(@Body() body: CreateSessionDto, @Req() req: Request) {
    if (!req.publicContext) throw new Error('publicContext missing — guard failed');
    return this.service.createSession(req.publicContext, {
      videoDurationMs: body.videoDurationMs,
      clientStartedAt: body.clientStartedAt,
    });
  }

  @Post(':sessionId/chunks')
  @PublicLandingEndpoint()
  @HttpCode(202)
  async append(
    @Param('sessionId') _sessionId: string,
    @Body() body: AppendChunkDto,
    @Req() req: Request,
  ) {
    if (!req.publicContext) throw new Error('publicContext missing — guard failed');
    await this.service.appendChunk(req.publicContext, body, { beacon: false });
    return { ok: true };
  }

  @Post(':sessionId/chunks/beacon')
  @PublicLandingEndpoint()
  @HttpCode(204)
  async beacon(
    @Param('sessionId') _sessionId: string,
    @Body() body: AppendChunkDto,
    @Req() req: Request,
  ) {
    if (!req.publicContext) throw new Error('publicContext missing — guard failed');
    await this.service.appendChunk(req.publicContext, body, { beacon: true });
    return;
  }
}
