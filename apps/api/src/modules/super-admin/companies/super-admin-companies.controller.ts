import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../../common/guards/super-admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/decorators/current-user.decorator';
import { SuperAdminCompaniesService } from './super-admin-companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@ApiTags('Super Admin — Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin/companies')
export class SuperAdminCompaniesController {
  constructor(private readonly svc: SuperAdminCompaniesService) {}

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.svc.create(dto);
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; logo?: string; customDomain?: string | null },
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.svc.deactivate(id, user.id);
  }

  @Post('exit')
  @HttpCode(200)
  exit(@CurrentUser() user: JwtUser) {
    return this.svc.exitCompany(user.id);
  }

  @Post(':id/switch')
  @HttpCode(200)
  switchTo(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.svc.switchToCompany(id, user.id);
  }
}
