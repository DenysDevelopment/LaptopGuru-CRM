import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const END_REASONS = ['ENDED', 'PAUSED_LONG', 'CLOSED', 'NAVIGATED', 'ERROR', 'INCOMPLETE'] as const;
export type EndReason = (typeof END_REASONS)[number];

export class AppendChunkDto {
  @ApiProperty() @IsInt() @Min(0) seq!: number;

  // Runtime shape validated in the service (each tuple is [number, number, number, ?unknown]).
  // class-validator cannot express heterogeneous tuples, so we only bound length here.
  @ApiProperty({ type: [Array] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(500)
  events!: unknown[];

  @ApiProperty() @IsBoolean() final!: boolean;

  @ApiProperty({ required: false, enum: END_REASONS })
  @IsOptional()
  @IsString()
  @IsIn(END_REASONS as unknown as string[])
  endReason?: EndReason;
}
