import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClassRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassroomRoles } from '../decorators/classroom-roles.decorator';
import { ClassroomRolesGuard } from './classroom-roles.guard';

class ClassroomRoute {
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER])
  update(): void {}
}

function createContext(): ExecutionContext {
  return {
    getHandler: () => ClassroomRoute.prototype.update,
    getClass: () => ClassroomRoute,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'user-id', username: 'teacher', fullName: 'Teacher', sessionId: 'session-id' },
        params: { classroomId: 'classroom-id' },
      }),
    }),
  } as unknown as ExecutionContext;
}

function createPrisma(membership: { id: string } | null): PrismaService {
  return {
    classroom: {
      findFirst: async () => ({ id: 'classroom-id' }),
    },
    classMembership: {
      findFirst: async (args: { where: { userId: string; classroomId: { in: string[] }; role: { in: ClassRole[] } } }) => {
        assert.equal(args.where.userId, 'user-id');
        assert.deepEqual(args.where.classroomId.in, ['classroom-id']);
        assert.deepEqual(args.where.role.in, [ClassRole.HOMEROOM_TEACHER]);
        return membership;
      },
    },
  } as unknown as PrismaService;
}

test('allows an active classroom role required by the route', async () => {
  const guard = new ClassroomRolesGuard(new Reflector(), createPrisma({ id: 'membership-id' }));
  assert.equal(await guard.canActivate(createContext()), true);
});

test('denies access when the user has no role in the target classroom', async () => {
  const guard = new ClassroomRolesGuard(new Reflector(), createPrisma(null));
  await assert.rejects(guard.canActivate(createContext()), ForbiddenException);
});
