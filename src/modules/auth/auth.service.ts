import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../common/services/password.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { getJwtSecrets } from './auth.config';
import { isJwtPayload, JwtPayload } from './jwt-payload';

const JWT_ISSUER = 'class-point';
const JWT_AUDIENCE = 'class-point-api';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  createdAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly secrets;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {
    this.secrets = getJwtSecrets(config);
    this.dummyPasswordHash = passwords.hash(randomUUID() + randomUUID());
  }

  async register(dto: RegisterDto): Promise<{ user: PublicUser } & Omit<TokenPair, 'refreshTokenHash' | 'refreshExpiresAt'>> {
    const username = dto.username.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            email,
            fullName: dto.fullName.trim(),
            passwordHash: await this.passwords.hash(dto.password),
          },
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            createdAt: true,
          },
        });
        const sessionId = randomUUID();
        const tokens = await this.signTokenPair(user, sessionId);
        await transaction.authSession.create({
          data: {
            id: sessionId,
            userId: user.id,
            tokenHash: tokens.refreshTokenHash,
            expiresAt: tokens.refreshExpiresAt,
          },
        });
        return {
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        };
      });
    } catch (error) {
      this.throwIfUniqueConstraint(error);
    }
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser } & Omit<TokenPair, 'refreshTokenHash' | 'refreshExpiresAt'>> {
    const identifier = dto.usernameOrEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ username: identifier }, { email: identifier }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        phone: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    const passwordMatches = await this.passwords.compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyPasswordHash),
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid username/email or password');
    }

    const { passwordHash: _passwordHash, ...publicUser } = user;
    const tokens = await this.createSession(publicUser);
    return {
      user: publicUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(dto: RefreshDto): Promise<Omit<TokenPair, 'refreshTokenHash' | 'refreshExpiresAt'>> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(dto.refreshToken, {
        secret: this.secrets.refresh,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)
      ) {
        throw new UnauthorizedException('Refresh token is invalid or expired');
      }
      throw error;
    }

    if (
      !isJwtPayload(payload) ||
      payload.type !== 'refresh' ||
      typeof payload.jti !== 'string'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const oldTokenHash = this.hashToken(dto.refreshToken);
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        tokenHash: oldTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      select: {
        id: true,
        tokenHash: true,
        user: {
          select: {
            id: true,
            username: true,
            isActive: true,
          },
        },
      },
    });
    if (!session || !this.hashMatches(oldTokenHash, session.tokenHash)) {
      throw new UnauthorizedException('Refresh token is invalid or has already been used');
    }

    const tokens = await this.signTokenPair(session.user, session.id);
    const rotation = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        userId: session.user.id,
        tokenHash: oldTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        tokenHash: tokens.refreshTokenHash,
        expiresAt: tokens.refreshExpiresAt,
      },
    });
    if (rotation.count !== 1) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string, sessionId: string): Promise<{ success: true }> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        phone: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User account is inactive');
    }
    return user;
  }

  private async createSession(
    user: Pick<User, 'id' | 'username'>,
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const tokens = await this.signTokenPair(user, sessionId);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: tokens.refreshTokenHash,
        expiresAt: tokens.refreshExpiresAt,
      },
    });
    return tokens;
  }

  private async signTokenPair(
    user: Pick<User, 'id' | 'username'>,
    sessionId: string,
  ): Promise<TokenPair> {
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, username: user.username, sid: sessionId, type: 'access' },
        this.signOptions(this.secrets.access, ACCESS_TTL_SECONDS),
      ),
      this.jwt.signAsync(
        {
          sub: user.id,
          username: user.username,
          sid: sessionId,
          type: 'refresh',
          jti: randomUUID(),
        },
        this.signOptions(this.secrets.refresh, REFRESH_TTL_SECONDS),
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hashToken(refreshToken),
      refreshExpiresAt,
    };
  }

  private signOptions(secret: string, expiresIn: number): JwtSignOptions {
    return {
      secret,
      expiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashMatches(actualHash: string, expectedHash: string): boolean {
    const actual = Buffer.from(actualHash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private throwIfUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Username or email is already in use');
    }
    throw error;
  }
}
