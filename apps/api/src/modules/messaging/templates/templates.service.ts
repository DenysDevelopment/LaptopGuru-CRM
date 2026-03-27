import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTemplateDto, CreateTemplateVariableDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { paginate, paginatedResponse } from '../../../common/dto/pagination.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { channelId?: string; status?: string; language?: string; page?: number; limit?: number }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const where = {
      ...(filters.channelId && { channelId: filters.channelId }),
      ...(filters.status && { status: filters.status as string }),
      ...(filters.language && { language: filters.language }),
    };
    const [data, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        include: { variables: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        ...paginate(page, limit),
      }),
      this.prisma.template.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
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
    return this.prisma.template.create({
      data: {
        name: dto.name,
        body: dto.body,
        channelId: dto.channelId,
        status: dto.status ?? 'DRAFT',
        externalId: dto.externalId,
        language: dto.language ?? 'pl',
        createdBy: userId,
        variables: dto.variables?.length
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
      include: { variables: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.ensureExists(id);
    return this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.channelId !== undefined && { channelId: dto.channelId }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.externalId !== undefined && { externalId: dto.externalId }),
        ...(dto.language !== undefined && { language: dto.language }),
      },
      include: { variables: { orderBy: { sortOrder: 'asc' } } },
    });
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
