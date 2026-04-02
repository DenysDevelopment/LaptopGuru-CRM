import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAutoReplyDto, UpdateAutoReplyDto } from './dto/create-auto-reply.dto';
import { ClsService } from 'nestjs-cls';
import { AutoReplyTrigger, ChannelType } from '../../../generated/prisma/client';

const TRIGGER_MAP: Record<string, string> = {
  NEW_CONVERSATION: 'FIRST_MESSAGE',
  KEYWORD: 'KEYWORD_MATCH',
  OUTSIDE_HOURS: 'OUTSIDE_BUSINESS_HOURS',
  NO_AGENT: 'FIRST_MESSAGE',
  WAIT_TIMEOUT: 'FIRST_MESSAGE',
};

@Injectable()
export class AutoReplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll(filters: { channelId?: string; trigger?: string; isActive?: string }) {
    const rules = await this.prisma.autoReplyRule.findMany({
      where: {
        ...(filters.channelId && { channelId: filters.channelId }),
        ...(filters.trigger && { trigger: filters.trigger as AutoReplyTrigger }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive === 'true' }),
      },
      include: {
        channel: { select: { type: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return rules.map((r) => ({
      id: r.id,
      name: r.keyword ? `${r.trigger}: ${r.keyword}` : String(r.trigger),
      triggerType: r.trigger,
      triggerValue: r.keyword,
      body: r.responseBody,
      enabled: r.isActive,
      channelType: r.channel?.type || null,
      createdAt: r.createdAt,
    }));
  }

  async create(dto: CreateAutoReplyDto, userId: string) {
    const ruleBody = dto.responseBody || dto.body;
    if (!ruleBody?.trim()) {
      throw new BadRequestException('body is required');
    }

    // Map frontend trigger type to Prisma enum
    const trigger = dto.trigger
      || (dto.triggerType ? TRIGGER_MAP[dto.triggerType] || 'FIRST_MESSAGE' : 'FIRST_MESSAGE');

    // Resolve channel by type if channelType is provided
    let channelId: string | null = dto.channelId || null;
    if (dto.channelType && !channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { type: dto.channelType as ChannelType },
        select: { id: true },
      });
      channelId = channel?.id || null;
    }

    const companyId = this.cls.get<string>('companyId');
    const rule = await this.prisma.autoReplyRule.create({
      data: {
        channelId,
        trigger: trigger as 'FIRST_MESSAGE' | 'OUTSIDE_BUSINESS_HOURS' | 'KEYWORD_MATCH',
        keyword: dto.keyword || dto.triggerValue || null,
        responseBody: ruleBody.trim(),
        isActive: dto.isActive ?? dto.enabled ?? true,
        priority: dto.priority ?? 0,
        createdBy: userId,
        companyId,
      },
      include: {
        channel: { select: { type: true } },
      },
    });

    return {
      id: rule.id,
      name: dto.name || (rule.keyword ? `${rule.trigger}: ${rule.keyword}` : String(rule.trigger)),
      triggerType: rule.trigger,
      triggerValue: rule.keyword,
      body: rule.responseBody,
      enabled: rule.isActive,
      channelType: rule.channel?.type || null,
      createdAt: rule.createdAt,
    };
  }

  async update(id: string, dto: UpdateAutoReplyDto) {
    await this.ensureExists(id);

    const data: Record<string, unknown> = {};

    if (typeof dto.enabled === 'boolean') data.isActive = dto.enabled;
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;
    if (dto.body) data.responseBody = dto.body.trim();
    if (dto.responseBody) data.responseBody = dto.responseBody.trim();
    if (dto.triggerValue !== undefined) data.keyword = dto.triggerValue || null;
    if (dto.keyword !== undefined) data.keyword = dto.keyword;
    if (dto.priority !== undefined) data.priority = dto.priority;

    if (dto.triggerType) {
      data.trigger = TRIGGER_MAP[dto.triggerType] || 'FIRST_MESSAGE';
    } else if (dto.trigger) {
      data.trigger = dto.trigger;
    }

    if (dto.channelType !== undefined) {
      if (dto.channelType) {
        const channel = await this.prisma.channel.findFirst({
          where: { type: dto.channelType as ChannelType },
          select: { id: true },
        });
        data.channelId = channel?.id || null;
      } else {
        data.channelId = null;
      }
    } else if (dto.channelId !== undefined) {
      data.channelId = dto.channelId;
    }

    const rule = await this.prisma.autoReplyRule.update({
      where: { id },
      data,
      include: {
        channel: { select: { type: true } },
      },
    });

    return {
      id: rule.id,
      name: rule.keyword ? `${rule.trigger}: ${rule.keyword}` : String(rule.trigger),
      triggerType: rule.trigger,
      triggerValue: rule.keyword,
      body: rule.responseBody,
      enabled: rule.isActive,
      channelType: rule.channel?.type || null,
      createdAt: rule.createdAt,
    };
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.autoReplyRule.delete({ where: { id } });
  }

  async toggle(id: string) {
    const rule = await this.ensureExists(id);
    const updated = await this.prisma.autoReplyRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
      include: {
        channel: { select: { type: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.keyword ? `${updated.trigger}: ${updated.keyword}` : String(updated.trigger),
      triggerType: updated.trigger,
      triggerValue: updated.keyword,
      body: updated.responseBody,
      enabled: updated.isActive,
      channelType: updated.channel?.type || null,
      createdAt: updated.createdAt,
    };
  }

  private async ensureExists(id: string) {
    const rule = await this.prisma.autoReplyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Auto-reply rule ${id} not found`);
    return rule;
  }
}
