import { IsString, IsNotEmpty, IsOptional, IsArray, IsUrl, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  logo?: string;

  @IsString()
  @IsNotEmpty()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  adminPassword: string;

  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];
}
