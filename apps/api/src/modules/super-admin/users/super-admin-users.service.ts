import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSuperAdminUserDto } from './dto/create-super-admin-user.dto';

@Injectable()
export class SuperAdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId?: string) {
    return this.prisma.raw.user.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        company: { select: { name: true, slug: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateSuperAdminUserDto) {
    if (dto.role !== 'SUPER_ADMIN' && !dto.companyId) {
      throw new BadRequestException('companyId is required for ADMIN/USER roles');
    }

    if (dto.companyId) {
      const company = await this.prisma.raw.company.findUnique({
        where: { id: dto.companyId },
      });
      if (!company) throw new NotFoundException('Company not found');
    }

    const existing = await this.prisma.raw.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hash(dto.password, 12);

    return this.prisma.raw.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        name: dto.name?.trim() ?? null,
        passwordHash,
        role: dto.role as 'SUPER_ADMIN' | 'ADMIN' | 'USER',
        companyId: dto.companyId ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });
  }
}
