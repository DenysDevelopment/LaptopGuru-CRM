import { IsString, IsInt, Min, Max } from 'class-validator';

export class UploadInitDto {
  @IsString()
  fileName: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_648) // 2 GB
  fileSize: number;

  @IsString()
  mimeType: string;

  @IsString()
  title: string;
}
