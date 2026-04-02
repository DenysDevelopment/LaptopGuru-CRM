import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../../common/guards/super-admin.guard';
import { SuperAdminUsersService } from './super-admin-users.service';
import { CreateSuperAdminUserDto } from './dto/create-super-admin-user.dto';

@ApiTags('Super Admin — Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin/users')
export class SuperAdminUsersController {
  constructor(private readonly svc: SuperAdminUsersService) {}

  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.svc.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateSuperAdminUserDto) {
    return this.svc.create(dto);
  }
}
