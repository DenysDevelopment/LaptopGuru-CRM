import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class AppendChunkDto {
  @IsInt() seq!: number;

  @IsArray()
  events!: unknown[];

  @IsBoolean()
  final!: boolean;

  @IsOptional() @IsString()
  endReason?: string;
}
