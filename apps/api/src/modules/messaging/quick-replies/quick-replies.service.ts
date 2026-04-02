import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class QuickRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll() {
    const quickReplies = await this.prisma.msgQuickReply.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return quickReplies.map((qr) => ({
      id: qr.id,
      shortcut: qr.shortcut,
      title: qr.title,
      body: qr.body,
      createdAt: qr.createdAt,
    }));
  }

  async create(dto: { shortcut: string; title: string; body: string }, userId: string) {
    if (!dto.shortcut?.trim() || !dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('shortcut, title, and body are required');
    }

    const companyId = this.cls.get<string>('companyId');
    const existing = await this.prisma.msgQuickReply.findFirst({
      where: { shortcut: dto.shortcut.trim(), companyId },
    });
    if (existing) {
      throw new ConflictException(`Shortcut "${dto.shortcut}" already exists`);
    }

    const quickReply = await this.prisma.msgQuickReply.create({
      data: {
        shortcut: dto.shortcut.trim(),
        title: dto.title.trim(),
        body: dto.body.trim(),
        createdBy: userId,
        companyId,
      },
    });

    return {
      id: quickReply.id,
      shortcut: quickReply.shortcut,
      title: quickReply.title,
      body: quickReply.body,
      createdAt: quickReply.createdAt,
    };
  }

  async update(id: string, dto: { shortcut?: string; title?: string; body?: string }) {
    await this.ensureExists(id);

    if (dto.shortcut !== undefined) {
      const companyId = this.cls.get<string>('companyId');
      const existing = await this.prisma.msgQuickReply.findFirst({
        where: { shortcut: dto.shortcut.trim(), companyId },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Shortcut "${dto.shortcut}" already exists`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.shortcut) data.shortcut = dto.shortcut.trim();
    if (dto.title) data.title = dto.title.trim();
    if (dto.body) data.body = dto.body.trim();

    const quickReply = await this.prisma.msgQuickReply.update({
      where: { id },
      data,
    });

    return {
      id: quickReply.id,
      shortcut: quickReply.shortcut,
      title: quickReply.title,
      body: quickReply.body,
      createdAt: quickReply.createdAt,
    };
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.msgQuickReply.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const reply = await this.prisma.msgQuickReply.findUnique({ where: { id } });
    if (!reply) throw new NotFoundException(`Quick reply ${id} not found`);
    return reply;
  }
}
