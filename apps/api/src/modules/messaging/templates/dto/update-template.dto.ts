import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { TemplateStatus } from '../../../../generated/prisma/client';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsString()
  channelType?: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  language?: string;
}
