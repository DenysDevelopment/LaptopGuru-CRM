import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { TeamRole } from '../../../../generated/prisma/client';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddTeamMemberDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}
