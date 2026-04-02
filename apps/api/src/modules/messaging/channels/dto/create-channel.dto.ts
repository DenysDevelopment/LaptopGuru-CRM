import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelType } from '../../../../generated/prisma/client';

export class ChannelConfigItemDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(ChannelType)
  type: ChannelType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigItemDto)
  config?: ChannelConfigItemDto[];
}
