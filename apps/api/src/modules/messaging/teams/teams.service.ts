import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto } from './dto/create-team.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async findAll() {
    const teams = await this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt,
      members: t.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    }));
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!team) throw new NotFoundException(`Team ${id} not found`);

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    };
  }

  async create(dto: CreateTeamDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }

    const companyId = this.cls.get<string>('companyId');
    const team = await this.prisma.team.create({
      data: {
        name: dto.name.trim(),
        description: dto.description || null,
        companyId,
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    };
  }

  async update(id: string, dto: UpdateTeamDto) {
    await this.ensureExists(id);
    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: { _count: { select: { members: true } } },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.team.delete({ where: { id } });
  }

  async addMember(teamId: string, dto: AddTeamMemberDto) {
    await this.ensureExists(teamId);

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this team');
    }

    return this.prisma.teamMember.create({
      data: {
        teamId,
        userId: dto.userId,
        role: dto.role ?? 'MEMBER',
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async removeMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    await this.prisma.teamMember.deleteMany({
      where: { teamId, userId },
    });

    return { ok: true };
  }

  private async ensureExists(id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException(`Team ${id} not found`);
    return team;
  }
}
