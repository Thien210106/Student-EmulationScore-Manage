import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
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
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

interface GoogleJwk extends JsonWebKey {
  kid?: string;
  use?: string;
}

interface GoogleIdTokenClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

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
  private readonly googleClientId: string | undefined;
  private readonly dummyPasswordHash: Promise<string>;
  private googleJwks: GoogleJwk[] = [];
  private googleJwksExpiresAt = 0;
  private googleJwksRequest: Promise<GoogleJwk[]> | null = null;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {
    this.secrets = getJwtSecrets(config);
    this.googleClientId = config.get<string>('GOOGLE_CLIENT_ID')?.trim() || undefined;
    this.dummyPasswordHash = passwords.hash(randomUUID() + randomUUID());
  }

  googleConfig(): { clientId: string | null } {
    return { clientId: this.googleClientId ?? null };
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
        const publicUser: PublicUser = {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          createdAt: user.createdAt,
        };
        const sessionId = randomUUID();
        const tokens = await this.signTokenPair(publicUser, sessionId);
        await transaction.authSession.create({
          data: {
            id: sessionId,
            userId: publicUser.id,
            tokenHash: tokens.refreshTokenHash,
            expiresAt: tokens.refreshExpiresAt,
          },
        });
        return {
          user: publicUser,
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

  async googleLogin(
    credential: string,
    nonce: string,
  ): Promise<{ user: PublicUser } & Omit<TokenPair, 'refreshTokenHash' | 'refreshExpiresAt'>> {
    const claims = await this.verifyGoogleIdToken(credential, nonce);
    const email = (claims.email as string).trim().toLowerCase();
    const subject = claims.sub as string;
    const fullName =
      typeof claims.name === 'string' && claims.name.trim()
        ? claims.name.trim().slice(0, 150)
        : email.slice(0, 150);
    const avatarUrl =
      typeof claims.picture === 'string' && claims.picture.length <= 2048
        ? claims.picture
        : null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { email },
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            createdAt: true,
            googleId: true,
            isActive: true,
          },
        });

        if (existing && !existing.isActive) {
          throw new UnauthorizedException('This account is inactive');
        }
        if (existing?.googleId && existing.googleId !== subject) {
          throw new UnauthorizedException('This email is linked to a different Google account');
        }

        const user = existing
          ? existing.googleId
            ? existing
            : await transaction.user.update({
                where: { id: existing.id },
                data: {
                  googleId: subject,
                  avatarUrl: existing.avatarUrl ?? avatarUrl,
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
              })
          : await transaction.user.create({
              data: {
                username: this.googleUsername(email),
                email,
                fullName,
                avatarUrl,
                googleId: subject,
                passwordHash: await this.passwords.hash(
                  randomBytes(48).toString('base64url'),
                ),
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

        const publicUser: PublicUser = {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          createdAt: user.createdAt,
        };
        const sessionId = randomUUID();
        const tokens = await this.signTokenPair(publicUser, sessionId);
        await transaction.authSession.create({
          data: {
            id: sessionId,
            userId: publicUser.id,
            tokenHash: tokens.refreshTokenHash,
            expiresAt: tokens.refreshExpiresAt,
          },
        });

        return {
          user: publicUser,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This Google account is already linked to another user');
      }
      throw error;
    }
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

  private googleUsername(email: string): string {
    const localPart = email.split('@')[0] ?? '';
    const prefix = localPart.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 35) || 'google';
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private async verifyGoogleIdToken(
    token: string,
    expectedNonce: string,
  ): Promise<GoogleIdTokenClaims & { sub: string; email: string }> {
    if (!this.googleClientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    let header: { alg?: unknown; kid?: unknown; typ?: unknown };
    let claims: GoogleIdTokenClaims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as typeof header;
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as GoogleIdTokenClaims;
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      (header.typ !== undefined && header.typ !== 'JWT')
    ) {
      throw new UnauthorizedException('Unsupported Google credential');
    }

    let jwk = (await this.getGoogleJwks()).find((key) => key.kid === header.kid);
    if (!jwk) {
      jwk = (await this.getGoogleJwks(true)).find((key) => key.kid === header.kid);
    }
    if (
      !jwk ||
      jwk.kty !== 'RSA' ||
      !jwk.n ||
      !jwk.e ||
      (jwk.alg !== undefined && jwk.alg !== 'RS256') ||
      (jwk.use !== undefined && jwk.use !== 'sig')
    ) {
      throw new UnauthorizedException('Google signing key was not found');
    }

    let validSignature = false;
    try {
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
      validSignature = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        publicKey,
        Buffer.from(parts[2], 'base64url'),
      );
    } catch {
      throw new UnauthorizedException('Invalid Google credential signature');
    }
    if (!validSignature) {
      throw new UnauthorizedException('Invalid Google credential signature');
    }

    const now = Math.floor(Date.now() / 1000);
    const audienceClaims = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const audiences = audienceClaims.filter(
      (audience): audience is string => typeof audience === 'string',
    );
    const verifiedEmail = claims.email_verified === true || claims.email_verified === 'true';
    if (
      !['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss)) ||
      !audiences.includes(this.googleClientId) ||
      (audiences.length > 1 && claims.azp !== this.googleClientId) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now ||
      typeof claims.iat !== 'number' ||
      claims.iat > now + 60 ||
      claims.nonce !== expectedNonce ||
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1 ||
      claims.sub.length > 255 ||
      typeof claims.email !== 'string' ||
      claims.email.length > 254 ||
      !verifiedEmail
    ) {
      throw new UnauthorizedException('Google credential is invalid, expired, or not verified');
    }

    return claims as GoogleIdTokenClaims & { sub: string; email: string };
  }

  private async getGoogleJwks(forceRefresh = false): Promise<GoogleJwk[]> {
    if (!forceRefresh && this.googleJwks.length && Date.now() < this.googleJwksExpiresAt) {
      return this.googleJwks;
    }
    if (this.googleJwksRequest) return this.googleJwksRequest;

    this.googleJwksRequest = (async () => {
      let response: Response;
      try {
        response = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
      } catch {
        throw new ServiceUnavailableException('Could not reach Google to verify sign-in');
      }
      if (!response.ok) {
        throw new ServiceUnavailableException('Google sign-in verification is unavailable');
      }

      const body = (await response.json().catch(() => null)) as
        | { keys?: unknown }
        | null;
      if (!body || !Array.isArray(body.keys)) {
        throw new ServiceUnavailableException('Google returned invalid signing keys');
      }

      this.googleJwks = body.keys as GoogleJwk[];
      const maxAge = response.headers
        .get('cache-control')
        ?.match(/max-age=(\d+)/i)?.[1];
      const cacheSeconds = maxAge ? Number(maxAge) : 3600;
      this.googleJwksExpiresAt = Date.now() + Math.max(cacheSeconds, 60) * 1000;
      return this.googleJwks;
    })();

    try {
      return await this.googleJwksRequest;
    } finally {
      this.googleJwksRequest = null;
    }
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
