import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class SuperAdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: CreateCompanyDto) {
    const existingSlug = await this.prisma.raw.company.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug) throw new ConflictException('Company slug already taken');

    const existingEmail = await this.prisma.raw.user.findUnique({
      where: { email: dto.adminEmail.toLowerCase().trim() },
    });
    if (existingEmail) throw new ConflictException('Admin email already registered');

    const passwordHash = await hash(dto.adminPassword, 12);

    const company = await this.prisma.raw.company.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        logo: dto.logo,
        enabledModules: dto.enabledModules,
        users: {
          create: {
            email: dto.adminEmail.toLowerCase().trim(),
            name: dto.adminName?.trim() ?? null,
            passwordHash,
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: { select: { id: true, email: true, role: true } },
      },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        userId: company.users[0].id,
        companyId: company.id,
        action: 'CREATE',
        entity: 'Company',
        entityId: company.id,
        payload: { name: company.name, slug: company.slug },
      },
    });

    return company;
  }

  async findAll() {
    return this.prisma.raw.company.findMany({
      include: {
        _count: { select: { users: true, landings: true, contacts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.raw.company.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, email: true, name: true, role: true, createdAt: true },
        },
        _count: {
          select: { landings: true, contacts: true, conversations: true, channels: true },
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async update(id: string, data: { name?: string; description?: string; logo?: string; customDomain?: string | null }) {
    const company = await this.prisma.raw.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    if (data.customDomain !== undefined && data.customDomain !== null) {
      const domain = data.customDomain.toLowerCase().trim();
      if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
        throw new BadRequestException('Invalid domain format');
      }
      const existing = await this.prisma.raw.company.findFirst({
        where: { customDomain: domain, id: { not: id } },
      });
      if (existing) throw new ConflictException('Domain already in use by another company');
      data.customDomain = domain;
    }

    return this.prisma.raw.company.update({ where: { id }, data });
  }

  async deactivate(id: string, adminUserId: string) {
    const company = await this.prisma.raw.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    const updated = await this.prisma.raw.company.update({
      where: { id },
      data: { isActive: false },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        userId: adminUserId,
        companyId: id,
        action: 'DEACTIVATE',
        entity: 'Company',
        entityId: id,
      },
    });

    return updated;
  }

  async switchToCompany(companyId: string, superAdminId: string) {
    const company = await this.prisma.raw.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (!company.isActive) throw new BadRequestException('Company is inactive');

    const admin = await this.prisma.raw.user.findUnique({
      where: { id: superAdminId },
      select: { id: true, email: true, permissions: true, tokenVersion: true },
    });
    if (!admin) throw new NotFoundException('User not found');

    const newVersion = admin.tokenVersion + 1;
    await this.prisma.raw.user.update({
      where: { id: superAdminId },
      data: { tokenVersion: newVersion },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        userId: superAdminId,
        companyId,
        action: 'SWITCH',
        entity: 'Company',
        entityId: companyId,
      },
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: 'SUPER_ADMIN',
      permissions: admin.permissions,
      companyId,
      tokenVersion: newVersion,
      impersonating: true,
    };

    return { accessToken: this.jwtService.sign(payload) };
  }

  async exitCompany(superAdminId: string) {
    const admin = await this.prisma.raw.user.findUnique({
      where: { id: superAdminId },
      select: { id: true, email: true, permissions: true, tokenVersion: true },
    });
    if (!admin) throw new NotFoundException('User not found');

    const newVersion = admin.tokenVersion + 1;
    await this.prisma.raw.user.update({
      where: { id: superAdminId },
      data: { tokenVersion: newVersion },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        userId: superAdminId,
        action: 'EXIT',
        entity: 'Company',
      },
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: 'SUPER_ADMIN',
      permissions: admin.permissions,
      companyId: null,
      tokenVersion: newVersion,
      impersonating: false,
    };

    return { accessToken: this.jwtService.sign(payload) };
  }
}
