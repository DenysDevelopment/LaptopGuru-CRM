import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminCompaniesController } from './companies/super-admin-companies.controller';
import { SuperAdminCompaniesService } from './companies/super-admin-companies.service';
import { SuperAdminUsersController } from './users/super-admin-users.controller';
import { SuperAdminUsersService } from './users/super-admin-users.service';
import { SuperAdminDashboardController } from './dashboard/super-admin-dashboard.controller';
import { SuperAdminDashboardService } from './dashboard/super-admin-dashboard.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    SuperAdminCompaniesController,
    SuperAdminUsersController,
    SuperAdminDashboardController,
  ],
  providers: [
    SuperAdminCompaniesService,
    SuperAdminUsersService,
    SuperAdminDashboardService,
  ],
})
export class SuperAdminModule {}
