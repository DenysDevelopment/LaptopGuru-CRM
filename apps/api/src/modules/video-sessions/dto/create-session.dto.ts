import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSessionDto {
  @IsString() slug!: string;
  @IsString() visitId!: string;
  @IsString() videoId!: string;

  @IsInt() @Min(0) @Max(24 * 3600 * 1000)
  videoDurationMs!: number;

  @IsOptional() @IsInt()
  clientStartedAt?: number;
}
