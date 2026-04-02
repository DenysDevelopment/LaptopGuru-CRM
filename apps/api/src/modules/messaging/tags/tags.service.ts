import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll() {
    const tags = await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color || '#6B7280',
    }));
  }

  async findOne(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: { _count: { select: { conversations: true } } },
    });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color || '#6B7280',
      conversationCount: tag._count.conversations,
    };
  }

  async create(data: { name: string; color?: string }) {
    const companyId = this.cls.get<string>('companyId');
    return this.prisma.tag.create({ data: { ...data, companyId } });
  }

  async update(id: string, data: { name?: string; color?: string }) {
    await this.ensureExists(id);
    return this.prisma.tag.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.tag.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }
}
