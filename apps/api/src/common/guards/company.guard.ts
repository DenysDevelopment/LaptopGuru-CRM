import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { JwtUser } from '../decorators/current-user.decorator';

@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;

    // Public route (no JWT) — no CLS setup needed, allow through
    if (!user) return true;

    const { role, companyId, impersonating } = user;

    if (role === 'SUPER_ADMIN' && !impersonating) {
      // SUPER_ADMIN in native mode — no company context, global access
      this.cls.set('companyId', null);
      return true;
    }

    if (!companyId) {
      // Non-super-admin without companyId = misconfigured account
      throw new ForbiddenException('No company assigned to this account');
    }

    // Set tenant context for this request
    this.cls.set('companyId', companyId);
    return true;
  }
}
