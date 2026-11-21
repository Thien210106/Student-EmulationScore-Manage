import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { getJwtSecrets } from './auth.config';
import { isJwtPayload } from './jwt-payload';

const JWT_ISSUER = 'class-point';
const JWT_AUDIENCE = 'class-point-api';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secrets = getJwtSecrets(config);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secrets.access,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!isJwtPayload(payload) || payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        isActive: true,
        authSessions: {
          some: {
            id: payload.sid,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        },
      },
      select: { id: true, username: true, fullName: true },
    });

    if (!user) {
      throw new UnauthorizedException('Access token is no longer valid');
    }
    return { ...user, sessionId: payload.sid };
  }
}
