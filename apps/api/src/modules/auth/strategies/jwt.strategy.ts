import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
  companyId: string | null;
  tokenVersion: number;
  impersonating?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    // Validate tokenVersion — ensures old tokens are invalid after switch/exit
    const user = await this.prisma.raw.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? 'USER',
      permissions: payload.permissions ?? [],
      companyId: payload.companyId ?? null,
      tokenVersion: payload.tokenVersion,
      impersonating: payload.impersonating ?? false,
    };
  }
}
