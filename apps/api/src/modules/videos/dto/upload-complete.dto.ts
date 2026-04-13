import { IsString } from 'class-validator';

export class UploadCompleteDto {
  @IsString()
  videoId: string;
}
