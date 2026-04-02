import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AutoReplyTrigger } from '../../../../generated/prisma/client';

export class CreateAutoReplyDto {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsString()
  channelType?: string;

  @IsOptional()
  @IsEnum(AutoReplyTrigger)
  trigger?: AutoReplyTrigger;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  @IsString()
  triggerValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  responseBody?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdateAutoReplyDto {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsString()
  channelType?: string;

  @IsOptional()
  @IsEnum(AutoReplyTrigger)
  trigger?: AutoReplyTrigger;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  @IsString()
  triggerValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  responseBody?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
