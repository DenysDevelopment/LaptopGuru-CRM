import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../../prisma/prisma.service';
import { ListEmailsDto } from './dto/list-emails.dto';
import { UpdateEmailDto } from './dto/update-email.dto';
import { parseEmail } from './email-parser.util';
import type { Prisma } from '../../generated/prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * List IncomingEmail with filters, pagination, and search.
   * Mirrors GET /api/emails from Next.js.
   */
  async findAll(query: ListEmailsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.IncomingEmailWhereInput = {};

    // Status filter
    switch (query.filter) {
      case 'new':
        where.processed = false;
        where.archived = false;
        break;
      case 'processed':
        where.processed = true;
        where.archived = false;
        break;
      case 'archived':
        where.archived = true;
        break;
      default:
        // "all" — show non-archived
        where.archived = false;
        break;
    }

    // Category filter
    if (query.category === 'lead' || query.category === 'other') {
      where.category = query.category;
    }

    // Search filter
    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { from: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerEmail: { contains: query.search, mode: 'insensitive' } },
        { productName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [emails, total] = await Promise.all([
      this.prisma.incomingEmail.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        ...paginate(page, limit),
      }),
      this.prisma.incomingEmail.count({ where }),
    ]);

    return paginatedResponse(emails, total, page, limit);
  }

  /**
   * Get single email with thread and related landings.
   * Mirrors GET /api/emails/[id] from Next.js.
   */
  async findOne(id: string) {
    const email = await this.prisma.incomingEmail.findUnique({
      where: { id },
      include: {
        landings: {
          include: {
            sentEmails: true,
            video: { select: { title: true, thumbnail: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    // Build thread: all items with same customerEmail + productUrl
    let thread = null;
    if (email.customerEmail && email.productUrl) {
      const relatedEmails = await this.prisma.incomingEmail.findMany({
        where: {
          customerEmail: email.customerEmail,
          productUrl: email.productUrl,
          id: { not: email.id },
        },
        orderBy: { receivedAt: 'asc' },
      });

      const allEmailIds = [email.id, ...relatedEmails.map((e) => e.id)];

      const relatedLandings = await this.prisma.landing.findMany({
        where: { emailId: { in: allEmailIds } },
        include: {
          sentEmails: true,
          video: { select: { title: true, thumbnail: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      thread = { emails: relatedEmails, landings: relatedLandings };
    }

    return { email, thread };
  }

  /**
   * Update email fields.
   * Mirrors PATCH /api/emails/[id] from Next.js.
   */
  async update(id: string, dto: UpdateEmailDto, userId: string) {
    // Verify email exists
    const existing = await this.prisma.incomingEmail.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Email not found');
    }

    const data: Record<string, unknown> = { ...dto };

    // Set processedById when marking as processed
    if (dto.processed === true) {
      data.processedById = userId;
    }

    return this.prisma.incomingEmail.update({
      where: { id },
      data,
    });
  }

  /**
   * Trigger IMAP sync — connect to IMAP, fetch emails, parse, save.
   * Mirrors POST /api/emails/sync + lib/imap.ts from Next.js.
   */
  async syncEmails(): Promise<number> {
    const client = new ImapFlow({
      host: process.env.IMAP_HOST!,
      port: Number(process.env.IMAP_PORT) || 993,
      secure: true,
      auth: {
        user: process.env.IMAP_USER!,
        pass: process.env.IMAP_PASSWORD!,
      },
      logger: false,
    });

    let imported = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const mailboxStatus = client.mailbox;
        if (!mailboxStatus || mailboxStatus.exists === 0) {
          return 0;
        }

        const messages = client.fetch('1:*', {
          envelope: true,
          source: true,
          uid: true,
        });

        for await (const msg of messages) {
          const messageId = msg.envelope?.messageId;
          if (!messageId) continue;

          // Skip if already in DB
          const existing = await this.prisma.incomingEmail.findUnique({
            where: { messageId },
          });
          if (existing) continue;

          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.text || '';
          const subject = parsed.subject || '';
          const body = (parsed.html ||
            parsed.textAsHtml ||
            parsed.text ||
            '') as string;

          // Extract customer data from email body
          const extracted = parseEmail(body, subject);

          const companyId = this.cls.get<string>('companyId');
          await this.prisma.incomingEmail.create({
            data: {
              messageId,
              from,
              subject,
              body,
              receivedAt: parsed.date || new Date(),
              productUrl: extracted.productUrl,
              productName: extracted.productName,
              customerName: extracted.customerName,
              customerEmail: extracted.customerEmail,
              customerPhone: extracted.customerPhone,
              category: extracted.category,
              companyId,
            },
          });

          imported++;
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error('IMAP sync failed', error);
      throw new InternalServerErrorException('Email sync failed');
    } finally {
      await client.logout().catch(() => {});
    }

    return imported;
  }
}
