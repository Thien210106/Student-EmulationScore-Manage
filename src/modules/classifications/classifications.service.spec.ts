import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { ClassRole } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassificationsService } from './classifications.service';

test('rejects empty or inverted classification ranges before database writes', async () => {
  let created = false;
  const prisma = {
    classificationRule: {
      create: async () => {
        created = true;
      },
    },
  } as unknown as PrismaService;
  const access = {
    requireRole: async (_userId: string, _classroomId: string, roles: ClassRole[]) => {
      assert.deepEqual(roles, [ClassRole.HOMEROOM_TEACHER]);
    },
  } as unknown as ClassroomAccessService;
  const service = new ClassificationsService(prisma, access);

  await assert.rejects(
    service.create(
      'classroom-id',
      { name: 'Invalid', minScore: 10, maxScore: 10 },
      'teacher-id',
    ),
    ConflictException,
  );
  assert.equal(created, false);
});

test('allows an open-ended classification interval', async () => {
  let savedMaxScore: number | null | undefined;
  const prisma = {
    classificationRule: {
      create: async ({ data }: { data: { maxScore: number | null } }) => {
        savedMaxScore = data.maxScore;
        return data;
      },
    },
  } as unknown as PrismaService;
  const access = {
    requireRole: async () => undefined,
  } as unknown as ClassroomAccessService;
  const service = new ClassificationsService(prisma, access);

  await service.create(
    'classroom-id',
    { name: 'Top level', minScore: 100 },
    'teacher-id',
  );

  assert.equal(savedMaxScore, null);
});
