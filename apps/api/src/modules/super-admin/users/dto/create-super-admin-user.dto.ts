import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength, IsIn } from 'class-validator';

export class CreateSuperAdminUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'USER'])
  role: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}
