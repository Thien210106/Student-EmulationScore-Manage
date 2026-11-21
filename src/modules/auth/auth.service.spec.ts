import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../common/services/password.service';
import { AuthService } from './auth.service';
import { getJwtSecrets } from './auth.config';
import { JwtPayload } from './jwt-payload';

const accessSecret = 'test-access-secret-with-at-least-32-characters';
const refreshSecret = 'test-refresh-secret-with-at-least-32-characters';
const issuer = 'class-point';
const audience = 'class-point-api';

function createConfig(): ConfigService {
  return new ConfigService({
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

test('requires distinct strong JWT secrets', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'too-short',
    JWT_REFRESH_SECRET: 'also-too-short',
  });
  assert.throws(() => getJwtSecrets(config), /at least 32 characters/);
});

test('bcrypt refuses passwords that exceed its UTF-8 input limit', async () => {
  const passwords = new PasswordService();
  await assert.rejects(async () => passwords.hash('😀'.repeat(19)), /72 UTF-8 bytes/);
  assert.equal(await passwords.compare('😀'.repeat(19), '$2b$12$invalid'), false);
});

test('registration hashes passwords and creates no implicit classroom role', async () => {
  const userId = randomUUID();
  let createdPasswordHash = '';
  let createdSession: { id: string; tokenHash: string } | undefined;
  const transaction = {
    user: {
      create: async ({ data }: { data: { passwordHash: string } }) => {
        createdPasswordHash = data.passwordHash;
        return {
          id: userId,
          username: 'student_01',
          email: 'student@example.com',
          fullName: 'Student One',
          avatarUrl: null,
          phone: null,
          createdAt: new Date(),
        };
      },
    },
    authSession: {
      create: async ({ data }: { data: { id: string; tokenHash: string } }) => {
        createdSession = data;
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
  } as unknown as PrismaService;
  const service = new AuthService(createConfig(), new JwtService({}), prisma, new PasswordService());

  const result = await service.register({
    username: 'Student_01',
    email: 'Student@Example.com',
    fullName: 'Student One',
    password: 'a-strong-password-123',
  });

  assert.notEqual(createdPasswordHash, 'a-strong-password-123');
  assert.match(createdPasswordHash, /^\$2[aby]\$12\$/);
  assert.equal(result.user.username, 'student_01');
  assert.equal(result.user.email, 'student@example.com');
  assert.equal('passwordHash' in result.user, false);
  assert.equal('role' in result.user, false);
  assert.ok(createdSession);
  assert.equal(createdSession.tokenHash, hashToken(result.refreshToken));

  const accessPayload = await new JwtService({}).verifyAsync<JwtPayload>(
    result.accessToken,
    { secret: accessSecret, issuer, audience },
  );
  assert.equal(accessPayload.type, 'access');
  assert.equal(accessPayload.sid, createdSession.id);
});

test('refresh tokens rotate atomically and cannot be reused', async () => {
  const jwt = new JwtService({});
  const userId = randomUUID();
  const sessionId = randomUUID();
  const oldRefreshToken = await jwt.signAsync(
    {
      sub: userId,
      username: 'student_01',
      sid: sessionId,
      type: 'refresh',
      jti: randomUUID(),
    },
    { secret: refreshSecret, issuer, audience, expiresIn: 3600 },
  );
  const session = {
    id: sessionId,
    userId,
    tokenHash: hashToken(oldRefreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
    user: { id: userId, username: 'student_01', isActive: true },
  };
  const prisma = {
    authSession: {
      findFirst: async () => {
        if (session.revokedAt || session.expiresAt <= new Date()) {
          return null;
        }
        return { ...session };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string };
        data: { tokenHash: string; expiresAt: Date };
      }) => {
        if (session.tokenHash !== where.tokenHash || session.revokedAt) {
          return { count: 0 };
        }
        session.tokenHash = data.tokenHash;
        session.expiresAt = data.expiresAt;
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  const service = new AuthService(createConfig(), jwt, prisma, new PasswordService());

  const rotated = await service.refresh({ refreshToken: oldRefreshToken });
  assert.notEqual(rotated.refreshToken, oldRefreshToken);
  assert.equal(session.tokenHash, hashToken(rotated.refreshToken));

  await assert.rejects(
    service.refresh({ refreshToken: oldRefreshToken }),
    UnauthorizedException,
  );
});
