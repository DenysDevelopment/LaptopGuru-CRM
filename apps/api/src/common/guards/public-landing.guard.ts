import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PublicLandingContext {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
}

@Injectable()
export class PublicLandingGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      body: Record<string, unknown>;
      publicContext?: PublicLandingContext;
    }>();

    const slug = req.params?.slug;
    if (!slug) throw new NotFoundException('slug missing');

    const visitId = (req.body?.visitId ?? req.params?.visitId) as string | undefined;
    const videoId = req.body?.videoId as string | undefined;
    if (!visitId || !videoId) throw new NotFoundException('visit/video missing');

    const visit = await this.prisma.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        landing: {
          select: { id: true, slug: true, companyId: true, videoId: true },
        },
      },
    });

    if (!visit) throw new NotFoundException('visit not found');
    if (visit.landing.slug !== slug) throw new ForbiddenException('slug mismatch');
    if (visit.landing.videoId !== videoId) throw new ForbiddenException('video mismatch');

    req.publicContext = {
      companyId: visit.landing.companyId,
      landingId: visit.landing.id,
      visitId: visit.id,
      videoId: visit.landing.videoId!,
    };
    return true;
  }
}
