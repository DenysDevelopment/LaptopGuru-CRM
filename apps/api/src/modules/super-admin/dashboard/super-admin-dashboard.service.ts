import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SuperAdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalCompanies,
      activeCompanies,
      totalUsers,
      totalContacts,
      totalConversations,
      companies,
    ] = await Promise.all([
      this.prisma.raw.company.count(),
      this.prisma.raw.company.count({ where: { isActive: true } }),
      this.prisma.raw.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      this.prisma.raw.contact.count(),
      this.prisma.raw.conversation.count(),
      this.prisma.raw.company.findMany({
        include: {
          _count: {
            select: {
              users: true,
              contacts: true,
              conversations: true,
              landings: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      totals: {
        totalCompanies,
        activeCompanies,
        totalUsers,
        totalContacts,
        totalConversations,
      },
      companies,
    };
  }
}
