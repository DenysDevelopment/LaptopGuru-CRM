import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS } from '@laptopguru-crm/shared';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // POST /admin/seed-email-channel
  async seedEmailChannel() {
    const companyId = this.cls.get<string | null>('companyId');
    if (!companyId) {
      throw new BadRequestException('No company context — cannot seed email channel');
    }

    const env = process.env;
    const imapHost = env.IMAP_HOST;
    const smtpHost = env.SMTP_HOST;

    if (!imapHost || !smtpHost) {
      throw new BadRequestException('IMAP_HOST and SMTP_HOST are not configured in env');
    }

    const existing = await this.prisma.raw.channel.findFirst({
      where: { type: 'EMAIL', companyId },
    });

    if (existing) {
      throw new ConflictException({
        error: 'Email channel already exists',
        channelId: existing.id,
      });
    }

    const channel = await this.prisma.raw.channel.create({
      data: {
        name: env.SMTP_FROM || 'Email',
        type: 'EMAIL',
        isActive: true,
        companyId,
        config: {
          create: [
            { key: 'imap_host', value: env.IMAP_HOST || '' },
            { key: 'imap_port', value: env.IMAP_PORT || '993' },
            { key: 'imap_user', value: env.IMAP_USER || '', isSecret: false },
            { key: 'imap_password', value: env.IMAP_PASSWORD || '', isSecret: true },
            { key: 'smtp_host', value: env.SMTP_HOST || '' },
            { key: 'smtp_port', value: env.SMTP_PORT || '587' },
            { key: 'smtp_user', value: env.SMTP_USER || '', isSecret: false },
            { key: 'smtp_password', value: env.SMTP_PASSWORD || '', isSecret: true },
            { key: 'smtp_from', value: env.SMTP_FROM || '' },
          ],
        },
      },
      include: { config: { select: { key: true, isSecret: true } } },
    });

    return {
      ok: true,
      channelId: channel.id,
      name: channel.name,
      configKeys: channel.config.map((c) => c.key),
    };
  }

  // GET /admin/users
  async findAllUsers() {
    const companyId = this.cls.get<string | null>('companyId');
    if (!companyId) {
      throw new BadRequestException('No company context');
    }
    return this.prisma.raw.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // POST /admin/users
  async createUser(body: { email: string; name?: string; password: string }) {
    const { email, name, password } = body;

    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    if (password.length > 128) {
      throw new BadRequestException('Password is too long');
    }

    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 255
    ) {
      throw new BadRequestException('Invalid email');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.prisma.raw.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const companyId = this.cls.get<string | null>('companyId');
    if (!companyId) {
      throw new BadRequestException('No company context — cannot create user');
    }

    const passwordHash = await hash(password, 12);
    return this.prisma.raw.user.create({
      data: {
        email: normalizedEmail,
        name: typeof name === 'string' ? name.trim().slice(0, 255) : null,
        passwordHash,
        companyId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });
  }

  // PATCH /admin/users/:id
  async updateUser(
    id: string,
    body: { role?: string; permissions?: string[] },
    currentUserId: string,
    currentUserEmail: string,
  ) {
    const { role, permissions } = body;

    // Prevent self-modification of role and permissions
    if (id === currentUserId) {
      if (role !== undefined && role !== 'ADMIN') {
        throw new BadRequestException('Cannot remove ADMIN role from yourself');
      }
      if (permissions !== undefined) {
        throw new BadRequestException('Cannot modify your own permissions');
      }
    }

    // Validate role
    if (role !== undefined && !['ADMIN', 'USER'].includes(role)) {
      throw new BadRequestException('Invalid role');
    }

    // Validate permissions
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        throw new BadRequestException('permissions must be an array');
      }
      const invalid = permissions.filter(
        (p: string) =>
          !ALL_PERMISSIONS.includes(
            p as (typeof ALL_PERMISSIONS)[number],
          ),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Unknown permissions: ${invalid.join(', ')}`,
        );
      }
    }

    // Verify target user exists
    const targetUser = await this.prisma.raw.user.findUnique({ where: { id } });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const companyId = this.cls.get<string | null>('companyId');
    if (!companyId || targetUser.companyId !== companyId) {
      throw new NotFoundException('User not found');
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (permissions !== undefined) updateData.permissions = permissions;

    const user = await this.prisma.raw.user.update({
      where: { id },
      data: updateData as Parameters<typeof this.prisma.raw.user.update>[0]['data'],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    // Audit log
    this.logger.log(
      `[AUDIT] User ${currentUserEmail} (${currentUserId}) modified user ${user.email} (${user.id}): ` +
        JSON.stringify({
          role: role ?? '(unchanged)',
          permissions: permissions
            ? `${permissions.length} perms`
            : '(unchanged)',
        }),
    );

    return user;
  }
}
