import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { JwtUser } from '../decorators/current-user.decorator';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user: JwtUser }>();

    if (user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Super-admin access required');
    }

    // Super-admin endpoints always see all tenants — clear company filter
    // This ensures even an impersonating SUPER_ADMIN can manage all companies
    this.cls.set('companyId', null);
    return true;
  }
}
