import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, ChannelConfigItemDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@ApiTags('Channels')
@ApiBearerAuth()
@Controller('messaging/channels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @RequirePermissions('messaging:channels:read')
  findAll() {
    return this.channelsService.findAll();
  }

  @Post()
  @RequirePermissions('messaging:channels:write')
  create(@Body() dto: CreateChannelDto) {
    return this.channelsService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('messaging:channels:read')
  findOne(@Param('id') id: string) {
    return this.channelsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('messaging:channels:write')
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channelsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('messaging:channels:write')
  remove(@Param('id') id: string, @Query('deleteData') deleteData?: string) {
    return this.channelsService.remove(id, deleteData === 'true');
  }

  @Post(':id/test')
  @RequirePermissions('messaging:channels:write')
  testConnection(@Param('id') id: string) {
    return this.channelsService.testConnection(id);
  }

  @Post(':id/config')
  @RequirePermissions('messaging:channels:write')
  upsertConfig(
    @Param('id') id: string,
    @Body() items: ChannelConfigItemDto[],
  ) {
    return this.channelsService.upsertConfig(id, items);
  }
}
