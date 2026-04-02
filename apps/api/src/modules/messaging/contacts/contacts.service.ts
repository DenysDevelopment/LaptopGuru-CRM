import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateContactDto, ContactChannelDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { SearchContactsDto } from './dto/search-contacts.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll(query: SearchContactsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { company: { contains: query.search, mode: 'insensitive' } },
        {
          channels: {
            some: { identifier: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.channelType) {
      where.channels = {
        ...(where.channels as object),
        some: { channelType: query.channelType },
      };
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          channels: {
            select: { channelType: true, identifier: true },
          },
          _count: {
            select: { conversations: true },
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    const phoneTypes = ['SMS', 'WHATSAPP'];

    const items = contacts.map((c) => {
      const emailCh = c.channels.find((ch) => ch.channelType === 'EMAIL');
      const phoneCh = c.channels.find((ch) => phoneTypes.includes(ch.channelType));

      return {
        id: c.id,
        name: c.displayName,
        email: emailCh?.identifier || null,
        phone: phoneCh?.identifier || null,
        avatarUrl: c.avatarUrl,
        company: c.company,
        channels: c.channels.map((ch) => ({
          type: ch.channelType,
          externalId: ch.identifier,
        })),
        conversationCount: c._count.conversations,
        createdAt: c.createdAt,
      };
    });

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        channels: {
          select: { channelType: true, identifier: true },
        },
        customFields: {
          select: { fieldName: true, fieldValue: true },
        },
        conversations: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            channel: { select: { type: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);

    const emailCh = contact.channels.find((ch) => ch.channelType === 'EMAIL');
    const phoneCh = contact.channels.find(
      (ch) => ch.channelType === 'SMS' || ch.channelType === 'WHATSAPP',
    );

    const customFields: Record<string, string> = {};
    for (const cf of contact.customFields) {
      customFields[cf.fieldName] = cf.fieldValue;
    }

    return {
      id: contact.id,
      name: contact.displayName,
      email: emailCh?.identifier || null,
      phone: phoneCh?.identifier || null,
      avatarUrl: contact.avatarUrl,
      company: contact.company,
      channels: contact.channels.map((ch) => ({
        type: ch.channelType,
        externalId: ch.identifier,
      })),
      customFields,
      conversations: contact.conversations.map((conv) => ({
        id: conv.id,
        status: conv.status,
        channelType: conv.channel.type,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.messages[0]?.body?.slice(0, 120) || null,
        createdAt: conv.createdAt,
      })),
      createdAt: contact.createdAt,
    };
  }

  async create(dto: CreateContactDto) {
    const companyId = this.cls.get<string>('companyId');
    return this.prisma.contact.create({
      data: {
        displayName: dto.displayName,
        firstName: dto.firstName,
        lastName: dto.lastName,
        avatarUrl: dto.avatarUrl,
        company: dto.company,
        jobTitle: dto.jobTitle,
        notes: dto.notes,
        companyId,
        channels: dto.channels?.length
          ? {
              create: dto.channels.map((ch) => ({
                channelType: ch.channelType,
                identifier: ch.identifier,
                isPrimary: ch.isPrimary ?? false,
                displayName: ch.displayName,
                companyId,
              })),
            }
          : undefined,
      },
      include: { channels: true },
    });
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.ensureExists(id);
    return this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.company !== undefined && { company: dto.company }),
        ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { channels: true },
    });
  }

  async addChannel(contactId: string, dto: ContactChannelDto) {
    await this.ensureExists(contactId);
    const companyId = this.cls.get<string>('companyId');
    return this.prisma.contactChannel.create({
      data: {
        contactId,
        channelType: dto.channelType,
        identifier: dto.identifier,
        isPrimary: dto.isPrimary ?? false,
        displayName: dto.displayName,
        companyId,
      },
    });
  }

  async mergeContacts(sourceId: string, targetId: string, userId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a contact with itself');
    }

    const [source, target] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: sourceId }, include: { channels: true } }),
      this.prisma.contact.findUnique({ where: { id: targetId } }),
    ]);

    if (!source) throw new NotFoundException(`Source contact ${sourceId} not found`);
    if (!target) throw new NotFoundException(`Target contact ${targetId} not found`);

    // Use transaction to ensure atomicity of merge operation
    return this.prisma.$transaction(async (tx) => {
      const merge = await tx.contactMerge.create({
        data: {
          sourceContactId: sourceId,
          targetContactId: targetId,
          mergedBy: userId,
          status: 'MERGED',
          mergedAt: new Date(),
        },
      });

      // Move conversations from source to target
      await tx.conversation.updateMany({
        where: { contactId: sourceId },
        data: { contactId: targetId },
      });

      // Move channels from source to target (skip duplicates)
      for (const ch of source.channels) {
        const existing = await tx.contactChannel.findFirst({
          where: {
            channelType: ch.channelType,
            identifier: ch.identifier,
          },
        });
        if (!existing || existing.contactId === sourceId) {
          await tx.contactChannel.updateMany({
            where: { id: ch.id },
            data: { contactId: targetId },
          });
        }
      }

      return merge;
    });
  }

  private async ensureExists(id: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return contact;
  }
}
