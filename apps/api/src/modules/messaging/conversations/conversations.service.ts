import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import type { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List conversations with filters, pagination, and unread counts.
   * Mirrors GET /api/messaging/conversations from Next.js.
   */
  async findAll(query: ListConversationsDto, currentUserId: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.channelType) {
      where.channel = { type: query.channelType };
    }

    if (query.assigneeId) {
      const userId =
        query.assigneeId === 'me' ? currentUserId : query.assigneeId;
      where.assignments = {
        some: { userId, isActive: true },
      };
    }

    if (query.tagIds?.length) {
      where.tags = {
        some: { tagId: { in: query.tagIds } },
      };
    }

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        {
          contact: {
            displayName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          contact: {
            channels: {
              some: {
                identifier: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip,
        take: limit,
        include: {
          contact: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              channels: {
                select: { channelType: true, identifier: true },
              },
            },
          },
          channel: { select: { id: true, type: true, name: true } },
          assignments: {
            where: { isActive: true },
            select: {
              user: { select: { id: true, name: true, email: true } },
            },
            take: 1,
          },
          tags: {
            include: { tag: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, createdAt: true, direction: true },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // Count unread messages per conversation (inbound messages without READ status)
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts =
      conversationIds.length > 0
        ? await this.prisma.message.groupBy({
            by: ['conversationId'],
            where: {
              conversationId: { in: conversationIds },
              direction: 'INBOUND',
              statuses: { none: { status: 'READ' } },
            },
            _count: true,
          })
        : [];
    const unreadMap = new Map(
      unreadCounts.map((u) => [u.conversationId, u._count]),
    );

    const items = conversations.map((c) => {
      const emailCh = c.contact?.channels.find(
        (ch) => ch.channelType === 'EMAIL',
      );
      const phoneCh = c.contact?.channels.find((ch) =>
        ['SMS', 'WHATSAPP', 'TELEGRAM'].includes(ch.channelType),
      );

      return {
        id: c.id,
        status: c.status,
        priority: c.priority,
        channelType: c.channel.type,
        subject: c.subject,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.messages[0]?.body?.slice(0, 120) || null,
        createdAt: c.createdAt,
        closedAt: c.closedAt,
        contact: c.contact
          ? {
              id: c.contact.id,
              name: c.contact.displayName,
              email: emailCh?.identifier || null,
              phone: phoneCh?.identifier || null,
              avatarUrl: c.contact.avatarUrl,
            }
          : null,
        assignee: c.assignments[0]?.user || null,
        tags: c.tags.map((ct) => ({
          id: ct.tag.id,
          name: ct.tag.name,
          color: ct.tag.color || '#6B7280',
        })),
        unreadCount: unreadMap.get(c.id) || 0,
      };
    });

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single conversation with contact, channel, assignments, tags.
   * Mirrors GET /api/messaging/conversations/:id from Next.js.
   */
  async findOne(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            company: true,
            channels: {
              select: { channelType: true, identifier: true },
            },
          },
        },
        channel: { select: { id: true, type: true, name: true } },
        assignments: {
          where: { isActive: true },
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
          take: 1,
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    const contact = conversation.contact;
    const emailChannel = contact?.channels.find(
      (ch) => ch.channelType === 'EMAIL',
    );
    const phoneChannel = contact?.channels.find(
      (ch) => ch.channelType === 'SMS' || ch.channelType === 'WHATSAPP',
    );

    return {
      id: conversation.id,
      status: conversation.status,
      priority: conversation.priority,
      channelType: conversation.channel.type,
      subject: conversation.subject,
      createdAt: conversation.createdAt,
      closedAt: conversation.closedAt,
      contact: contact
        ? {
            id: contact.id,
            name: contact.displayName,
            email: emailChannel?.identifier || null,
            phone: phoneChannel?.identifier || null,
            avatarUrl: contact.avatarUrl,
            company: contact.company,
            channels: contact.channels.map((ch) => ({
              type: ch.channelType,
              externalId: ch.identifier,
            })),
          }
        : null,
      assignee: conversation.assignments[0]?.user || null,
      tags: conversation.tags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color || '#6B7280',
      })),
    };
  }

  /**
   * Update conversation status / priority.
   * Mirrors PATCH /api/messaging/conversations/:id from Next.js.
   */
  async update(id: string, dto: UpdateConversationDto) {
    await this.ensureExists(id);

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'CLOSED' || dto.status === 'RESOLVED') {
        data.closedAt = new Date();
      }
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.subject !== undefined) data.subject = dto.subject;

    return this.prisma.conversation.update({
      where: { id },
      data,
    });
  }

  /**
   * Assign conversation to a user.
   * Mirrors POST /api/messaging/conversations/:id/assign from Next.js.
   */
  async assign(conversationId: string, assigneeId: string, assignedById: string) {
    await this.ensureExists(conversationId);

    return this.prisma.$transaction(async (tx) => {
      // Deactivate current assignments
      await tx.conversationAssignment.updateMany({
        where: { conversationId, isActive: true },
        data: { isActive: false, unassignedAt: new Date() },
      });

      // Create new assignment
      const assignment = await tx.conversationAssignment.create({
        data: {
          conversationId,
          userId: assigneeId,
          assignedBy: assignedById,
          isActive: true,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Update conversation status to OPEN if it was NEW
      await tx.conversation.updateMany({
        where: { id: conversationId, status: 'NEW' },
        data: { status: 'OPEN' },
      });

      return assignment;
    });
  }

  /**
   * Mark all inbound messages in a conversation as READ.
   * Mirrors POST /api/messaging/conversations/:id/read from Next.js.
   */
  async markAsRead(conversationId: string) {
    await this.ensureExists(conversationId);

    // Find all inbound messages that don't have a READ status
    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        direction: 'INBOUND',
        statuses: { none: { status: 'READ' } },
      },
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      await this.prisma.messageStatusEvent.createMany({
        data: unreadMessages.map((m) => ({
          messageId: m.id,
          status: 'READ' as const,
        })),
      });
    }

    return { ok: true, markedRead: unreadMessages.length };
  }

  /**
   * Add a tag to a conversation.
   * Mirrors POST /api/messaging/conversations/:id/tags from Next.js.
   */
  async addTag(conversationId: string, tagId: string, userId: string) {
    await this.ensureExists(conversationId);

    const conversationTag = await this.prisma.conversationTag.create({
      data: {
        conversationId,
        tagId,
        addedBy: userId,
      },
      include: { tag: true },
    });

    return {
      id: conversationTag.tag.id,
      name: conversationTag.tag.name,
      color: conversationTag.tag.color || '#6B7280',
    };
  }

  /**
   * Remove a tag from a conversation.
   */
  async removeTag(conversationId: string, tagId: string) {
    await this.ensureExists(conversationId);

    const ct = await this.prisma.conversationTag.findUnique({
      where: { conversationId_tagId: { conversationId, tagId } },
    });
    if (!ct) {
      throw new NotFoundException(
        `Tag ${tagId} not found on conversation ${conversationId}`,
      );
    }

    return this.prisma.conversationTag.delete({
      where: { id: ct.id },
    });
  }

  /**
   * Get internal notes for a conversation.
   * Mirrors GET /api/messaging/conversations/:id/notes from Next.js.
   */
  async getNotes(conversationId: string) {
    await this.ensureExists(conversationId);

    return this.prisma.internalNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Get lead data for a conversation's contact.
   * Mirrors GET /api/messaging/conversations/:id/lead-data from Next.js.
   */
  async getLeadData(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: {
          include: {
            channels: true,
            customFields: true,
          },
        },
        channel: { select: { type: true } },
      },
    });

    if (!conversation?.contact) {
      throw new NotFoundException(
        `Contact not found for conversation ${conversationId}`,
      );
    }

    const contact = conversation.contact;
    const emailCh = contact.channels.find((c) => c.channelType === 'EMAIL');
    const fields = Object.fromEntries(
      contact.customFields.map((f) => [f.fieldName, f.fieldValue]),
    );

    return {
      contactId: contact.id,
      customerName: contact.displayName,
      customerEmail: emailCh?.identifier || null,
      customerPhone: fields.phone || null,
      productName: fields.productName || null,
      productUrl: fields.productUrl || null,
      channelType: conversation.channel.type,
      conversationId,
    };
  }

  private async ensureExists(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation)
      throw new NotFoundException(`Conversation ${id} not found`);
    return conversation;
  }
}
