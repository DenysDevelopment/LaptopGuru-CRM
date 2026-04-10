import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { VideosService } from './videos.service';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { AddVideoDto } from './dto/add-video.dto';
import { UpdateYoutubeChannelDto } from './dto/update-youtube-channel.dto';
import { UploadInitDto } from './dto/upload-init.dto';
import { UploadCompleteDto } from './dto/upload-complete.dto';

@ApiTags('Videos')
@ApiBearerAuth()
@Controller('videos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIDEOS_READ)
  findAll() {
    return this.videosService.findAll();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  addVideo(@Body() dto: AddVideoDto, @CurrentUser() user: JwtUser) {
    return this.videosService.addVideo(dto.url, user.id);
  }

  @Post('sync')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  sync(@CurrentUser() user: JwtUser) {
    return this.videosService.syncFromChannel(user.id);
  }

  @Get('youtube-channel')
  @RequirePermissions(PERMISSIONS.VIDEOS_READ)
  getYoutubeChannel() {
    return this.videosService.getYoutubeChannel();
  }

  @Patch('youtube-channel')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  updateYoutubeChannel(@Body() dto: UpdateYoutubeChannelDto) {
    return this.videosService.updateYoutubeChannel(dto.handle);
  }

  @Delete('youtube-channel')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  removeYoutubeChannel() {
    return this.videosService.removeYoutubeChannel();
  }

  @Post('upload-init')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  uploadInit(@Body() dto: UploadInitDto, @CurrentUser() user: JwtUser) {
    return this.videosService.createUploadInit(dto, user.id);
  }

  @Post('upload-complete')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  uploadComplete(@Body() dto: UploadCompleteDto) {
    return this.videosService.createUploadComplete(dto.videoId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.VIDEOS_WRITE)
  remove(@Param('id') id: string) {
    return this.videosService.remove(id);
  }
}
