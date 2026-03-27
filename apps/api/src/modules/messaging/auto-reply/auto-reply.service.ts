import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAutoReplyDto, UpdateAutoReplyDto } from './dto/create-auto-reply.dto';

@Injectable()
export class AutoReplyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { channelId?: string; trigger?: string; isActive?: string }) {
    return this.prisma.autoReplyRule.findMany({
      where: {
        ...(filters.channelId && { channelId: filters.channelId }),
        ...(filters.trigger && { trigger: filters.trigger as string }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive === 'true' }),
      },
      include: {
        channel: { select: { id: true, name: true, type: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateAutoReplyDto, userId: string) {
    return this.prisma.autoReplyRule.create({
      data: {
        channelId: dto.channelId,
        trigger: dto.trigger,
        keyword: dto.keyword,
        responseBody: dto.responseBody,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        createdBy: userId,
      },
      include: {
        channel: { select: { id: true, name: true, type: true } },
      },
    });
  }

  async update(id: string, dto: UpdateAutoReplyDto) {
    await this.ensureExists(id);
    return this.prisma.autoReplyRule.update({
      where: { id },
      data: {
        ...(dto.channelId !== undefined && { channelId: dto.channelId }),
        ...(dto.trigger !== undefined && { trigger: dto.trigger }),
        ...(dto.keyword !== undefined && { keyword: dto.keyword }),
        ...(dto.responseBody !== undefined && { responseBody: dto.responseBody }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
      include: {
        channel: { select: { id: true, name: true, type: true } },
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.autoReplyRule.delete({ where: { id } });
  }

  async toggle(id: string) {
    const rule = await this.ensureExists(id);
    return this.prisma.autoReplyRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
      include: {
        channel: { select: { id: true, name: true, type: true } },
      },
    });
  }

  private async ensureExists(id: string) {
    const rule = await this.prisma.autoReplyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Auto-reply rule ${id} not found`);
    return rule;
  }
}
