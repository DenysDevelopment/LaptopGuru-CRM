import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { VisitPlaybackService } from './visit-playback.service';

@ApiTags('Visit Playback')
@ApiBearerAuth()
@Controller('landings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitPlaybackController {
  constructor(
    private readonly service: VisitPlaybackService,
    private readonly cls: ClsService,
  ) {}

  @Get(':slug/visits/:visitId/playback')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  getPlayback(@Param('slug') slug: string, @Param('visitId') visitId: string) {
    const companyId = this.cls.get<string | null>('companyId');
    return this.service.getForVisit(slug, visitId, companyId);
  }
}
