import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findByConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return this.prisma.internalNote.findMany({
      where: { conversationId },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(conversationId: string, body: string, authorId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const companyId = this.cls.get<string>('companyId');
    return this.prisma.internalNote.create({
      data: {
        conversationId,
        authorId,
        body,
        companyId,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(id: string, body: string, userId: string) {
    const note = await this.prisma.internalNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException(`Note ${id} not found`);
    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own notes');
    }

    return this.prisma.internalNote.update({
      where: { id },
      data: { body },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string, userId: string) {
    const note = await this.prisma.internalNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException(`Note ${id} not found`);
    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own notes');
    }

    return this.prisma.internalNote.delete({ where: { id } });
  }
}
