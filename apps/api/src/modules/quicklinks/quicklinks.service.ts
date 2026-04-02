import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { ClsService } from 'nestjs-cls';

interface CreateQuickLinkDto {
  slug: string;
  targetUrl: string;
  name?: string;
}

@Injectable()
export class QuickLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll() {
    return this.prisma.quickLink.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { visits: true } },
        visits: {
          orderBy: { visitedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            visitedAt: true,
            ip: true,
            country: true,
            city: true,
            browser: true,
            os: true,
            deviceType: true,
            referrerDomain: true,
          },
        },
      },
    });
  }

  async create(dto: CreateQuickLinkDto, userId: string) {
    const { slug, targetUrl, name } = dto;

    if (!slug || !targetUrl) {
      throw new BadRequestException('slug and targetUrl are required');
    }

    // Validate slug format
    if (!/^[a-z0-9\-]+$/.test(slug)) {
      throw new BadRequestException('slug can only contain a-z, 0-9, -');
    }

    if (slug.length > 50) {
      throw new BadRequestException('slug cannot be longer than 50 characters');
    }

    // Validate targetUrl format
    try {
      const parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new BadRequestException('URL must start with http:// or https://');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid URL');
    }

    // Check uniqueness
    const companyId = this.cls.get<string>('companyId');
    const existing = await this.prisma.quickLink.findFirst({ where: { slug, companyId } });
    if (existing) {
      throw new ConflictException('This slug is already taken');
    }

    return this.prisma.quickLink.create({
      data: {
        slug,
        targetUrl,
        name: name || null,
        userId,
        companyId,
      },
    });
  }

  async remove(id: string, user: JwtUser) {
    if (!id) {
      throw new BadRequestException('id is required');
    }

    const link = await this.prisma.quickLink.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException('Link not found');
    }

    // Verify ownership (admin can delete any, user only their own)
    if (user.role !== 'ADMIN' && link.userId !== user.id) {
      throw new ForbiddenException('No permission to delete this link');
    }

    try {
      await this.prisma.quickLinkVisit.deleteMany({ where: { quickLinkId: id } });
      await this.prisma.quickLink.delete({ where: { id } });
      return { ok: true };
    } catch {
      throw new InternalServerErrorException('Delete error');
    }
  }
}
