import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { LandingsService } from './landings.service';

@ApiTags('Landings')
@Controller('landings')
export class LandingsController {
  constructor(
    private readonly landingsService: LandingsService,
    private readonly cls: ClsService,
  ) {}

  /** Track click — public, no auth */
  @Post(':slug/click')
  @SkipThrottle()
  @HttpCode(200)
  async trackClick(@Param('slug') slug: string, @Req() req: Request) {
    const result = await this.landingsService.trackClick(slug, req);
    if (result.statusCode === 429) {
      throw new HttpException({ error: result.error }, 429);
    }
    return result;
  }

  /** Create visit — public, no auth */
  @Post(':slug/track')
  @SkipThrottle()
  @HttpCode(200)
  async createVisit(
    @Param('slug') slug: string,
    @Body() body: Record<string, any>,
    @Req() req: Request,
  ) {
    return this.landingsService.createVisit(slug, body, req);
  }

  /** Update engagement data — public, no auth */
  @Patch(':slug/track')
  @SkipThrottle()
  @HttpCode(200)
  async updateEngagement(
    @Param('slug') _slug: string,
    @Body() body: Record<string, any>,
  ) {
    return this.landingsService.updateEngagement(body);
  }

  /** Get analytics — requires auth */
  @Get(':slug/analytics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  getAnalytics(@Param('slug') slug: string) {
    return this.landingsService.getAnalytics(slug);
  }

  /** Get per-visit video playback sessions — requires auth */
  @Get(':slug/visits/:visitId/playback')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  getVisitPlayback(
    @Param('slug') slug: string,
    @Param('visitId') visitId: string,
  ) {
    const companyId = this.cls.get<string>('companyId');
    return this.landingsService.getVisitPlayback(slug, visitId, companyId);
  }
}
