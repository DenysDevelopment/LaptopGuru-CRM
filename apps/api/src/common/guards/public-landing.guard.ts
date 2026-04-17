import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_LANDING_ENDPOINT } from '../decorators/public-landing-endpoint.decorator';

export interface PublicContext {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
  sessionId?: string;
}

@Injectable()
export class PublicLandingGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_LANDING_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return true;

    const req = context.switchToHttp().getRequest<import('express').Request>();
    const body = req.body ?? {};
    const params = req.params ?? {};

    // Chunk route: sessionId in URL, slug/visitId/videoId may be absent.
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
    if (sessionId) {
      const session = await this.prisma.raw.videoPlaybackSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          landingVisitId: true,
          videoId: true,
          companyId: true,
          visit: { select: { landingId: true } },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      req.publicContext = {
        companyId: session.companyId,
        landingId: session.visit.landingId,
        visitId: session.landingVisitId,
        videoId: session.videoId,
        sessionId: session.id,
      };
      return true;
    }

    // Create-session route: body must contain slug, visitId, videoId
    const slug = typeof body.slug === 'string' ? body.slug : undefined;
    const visitId = typeof body.visitId === 'string' ? body.visitId : undefined;
    const videoId = typeof body.videoId === 'string' ? body.videoId : undefined;

    if (!slug || !visitId || !videoId) {
      throw new BadRequestException('slug, visitId, and videoId are required');
    }

    const visit = await this.prisma.raw.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        landing: { select: { id: true, slug: true, companyId: true, videoId: true } },
      },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.landing.slug !== slug) throw new BadRequestException('Visit does not belong to slug');
    if (visit.landing.videoId !== videoId)
      throw new BadRequestException('Video does not belong to landing');

    req.publicContext = {
      companyId: visit.landing.companyId,
      landingId: visit.landing.id,
      visitId: visit.id,
      videoId,
    };
    return true;
  }
}
