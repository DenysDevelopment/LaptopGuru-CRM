import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { ClsService } from 'nestjs-cls';
import { VideoAnalyticsService } from './video-analytics.service';

@ApiTags('Video Analytics')
@ApiBearerAuth()
@Controller('videos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VideoAnalyticsController {
  constructor(
    private readonly analyticsService: VideoAnalyticsService,
    private readonly cls: ClsService,
  ) {}

  @Get(':id/analytics')
  @RequirePermissions(PERMISSIONS.VIDEOS_READ)
  async getAnalytics(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const companyId = this.cls.get<string>('companyId');
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();
    return this.analyticsService.getFullAnalytics(id, companyId, fromDate, toDate);
  }
}
