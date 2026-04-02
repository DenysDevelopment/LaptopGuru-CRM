import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MessageContentType } from '../../../../generated/prisma/client';

export class AttachmentDto {
  @IsString()
  @MaxLength(500)
  fileName: string;

  @IsString()
  @MaxLength(200)
  mimeType: string;

  @IsString()
  @MaxLength(1000)
  storageKey: string;

  @IsString()
  @MaxLength(2048)
  storageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  thumbnailKey?: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsEnum(MessageContentType)
  contentType?: MessageContentType = MessageContentType.TEXT;

  @IsString()
  @MaxLength(10000)
  body: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
