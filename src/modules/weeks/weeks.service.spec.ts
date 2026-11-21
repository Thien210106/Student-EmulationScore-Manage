import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClassRole } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WeeksService } from './weeks.service';

test('rejects invalid calendar dates and non-Monday week starts before inserting', async () => {
  let inserted = false;
  const prisma = {
    competitionWeek: {
      findFirst: async () => null,
      create: async () => {
        inserted = true;
      },
    },
  } as unknown as PrismaService;
  const access = {
    requireRole: async (_userId: string, _classroomId: string, roles: ClassRole[]) => {
      assert.deepEqual(roles, [ClassRole.HOMEROOM_TEACHER]);
    },
  } as unknown as ClassroomAccessService;
  const service = new WeeksService(prisma, access);

  await assert.rejects(
    service.create(
      'classroom-id',
      { name: 'Invalid', startDate: '2026-02-31', endDate: '2026-03-08' },
      'teacher-id',
    ),
    BadRequestException,
  );
  await assert.rejects(
    service.create(
      'classroom-id',
      { name: 'Wrong start', startDate: '2026-09-08', endDate: '2026-09-14' },
      'teacher-id',
    ),
    BadRequestException,
  );
  assert.equal(inserted, false);
});

test('does not reopen a competition week that has already ended', async () => {
  let updated = false;
  const prisma = {
    competitionWeek: {
      findUnique: async () => ({
        id: 'week-id',
        classroomId: 'classroom-id',
        isClosed: true,
        endDate: new Date('2000-01-02T00:00:00.000Z'),
      }),
      update: async () => {
        updated = true;
      },
    },
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const service = new WeeksService(prisma, access);

  await assert.rejects(service.reopen('week-id', 'teacher-id'), ConflictException);
  assert.equal(updated, false);
});
