import { IsInt, IsISO8601, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty() @IsString() @MaxLength(100) slug!: string;
  @ApiProperty() @IsString() @MaxLength(40) visitId!: string;
  @ApiProperty() @IsString() @MaxLength(40) videoId!: string;
  @ApiProperty() @IsInt() @Min(0) videoDurationMs!: number;
  @ApiProperty() @IsISO8601() clientStartedAt!: string;
}
