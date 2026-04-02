import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTemplateDto, CreateTemplateVariableDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ClsService } from 'nestjs-cls';
import { ChannelType, TemplateStatus } from '../../../generated/prisma/client';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll(filters: { channelId?: string; status?: string; language?: string }) {
    const where = {
      ...(filters.channelId && { channelId: filters.channelId }),
      ...(filters.status && { status: filters.status as TemplateStatus }),
      ...(filters.language && { language: filters.language }),
    };

    const templates = await this.prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variables: {
          orderBy: { sortOrder: 'asc' },
          select: { key: true, label: true, defaultValue: true },
        },
        channel: { select: { type: true } },
      },
    });

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      body: t.body,
      channelType: t.channel?.type || null,
      status: t.status,
      variables: t.variables.map((v) => v.key),
      createdAt: t.createdAt,
    }));
  }

  async findOne(id: string) {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: {
        variables: { orderBy: { sortOrder: 'asc' } },
        channel: { select: { id: true, name: true, type: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  async create(dto: CreateTemplateDto, userId: string) {
    if (!dto.name?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('name and body are required');
    }

    // Find channel id by type if channelType provided
    let channelId: string | null = dto.channelId || null;
    if (dto.channelType && !channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { type: dto.channelType as ChannelType },
        select: { id: true },
      });
      channelId = channel?.id || null;
    }

    // Extract variables like {{name}} from body
    const varMatches: string[] = dto.body.match(/\{\{(\w+)\}\}/g) || [];
    const variableKeys: string[] = [
      ...new Set(varMatches.map((m: string) => m.replace(/[{}]/g, ''))),
    ];

    const companyId = this.cls.get<string>('companyId');
    const template = await this.prisma.template.create({
      data: {
        name: dto.name.trim(),
        body: dto.body.trim(),
        channelId,
        status: dto.status ?? 'DRAFT',
        externalId: dto.externalId,
        language: dto.language ?? 'pl',
        createdBy: userId,
        companyId,
        variables:
          variableKeys.length > 0
            ? {
                create: variableKeys.map((key, idx) => ({
                  key,
                  label: key,
                  sortOrder: idx,
                })),
              }
            : dto.variables?.length
              ? {
                  create: dto.variables.map((v) => ({
                    key: v.key,
                    label: v.label,
                    defaultValue: v.defaultValue,
                    sortOrder: v.sortOrder ?? 0,
                  })),
                }
              : undefined,
      },
      include: {
        variables: { select: { key: true } },
        channel: { select: { type: true } },
      },
    });

    return {
      id: template.id,
      name: template.name,
      body: template.body,
      channelType: template.channel?.type || null,
      status: template.status,
      variables: template.variables.map((v) => v.key),
      createdAt: template.createdAt,
    };
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.ensureExists(id);

    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.body) data.body = dto.body.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.externalId !== undefined) data.externalId = dto.externalId;
    if (dto.language !== undefined) data.language = dto.language;

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

    const template = await this.prisma.template.update({
      where: { id },
      data,
      include: {
        variables: { select: { key: true } },
        channel: { select: { type: true } },
      },
    });

    // If body changed, re-sync variables from {{var}} pattern
    if (dto.body) {
      const varMatches: string[] = dto.body.match(/\{\{(\w+)\}\}/g) || [];
      const variableKeys: string[] = [
        ...new Set(varMatches.map((m: string) => m.replace(/[{}]/g, ''))),
      ];

      await this.prisma.templateVariable.deleteMany({ where: { templateId: id } });
      if (variableKeys.length > 0) {
        await this.prisma.templateVariable.createMany({
          data: variableKeys.map((key, idx) => ({
            templateId: id,
            key,
            label: key,
            sortOrder: idx,
          })),
        });
      }

      return {
        id: template.id,
        name: template.name,
        body: template.body,
        channelType: template.channel?.type || null,
        status: template.status,
        variables: variableKeys,
        createdAt: template.createdAt,
      };
    }

    return {
      id: template.id,
      name: template.name,
      body: template.body,
      channelType: template.channel?.type || null,
      status: template.status,
      variables: template.variables.map((v) => v.key),
      createdAt: template.createdAt,
    };
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.template.delete({ where: { id } });
  }

  async addVariable(templateId: string, dto: CreateTemplateVariableDto) {
    await this.ensureExists(templateId);
    return this.prisma.templateVariable.create({
      data: {
        templateId,
        key: dto.key,
        label: dto.label,
        defaultValue: dto.defaultValue,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  private async ensureExists(id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }
}
