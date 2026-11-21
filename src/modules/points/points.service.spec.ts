import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClassRole, PointStatus, PointType, Prisma, RankingMode } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PointsService } from './points.service';

test('creates a point using the fixed criterion default', async () => {
  let createdPoint: unknown;
  const prisma = {
    classStudent: { findFirst: async () => ({ id: 'enrollment-id' }) },
    criterion: {
      findFirst: async () => ({
        id: 'criterion-id',
        type: PointType.BONUS,
        defaultPoint: { toNumber: () => 2 },
        minPoint: { toNumber: () => 0 },
        maxPoint: { toNumber: () => 4 },
      }),
    },
    competitionWeek: {
      findFirst: async () => ({
        id: 'week-id',
        isClosed: false,
        endDate: new Date('2999-12-31T00:00:00.000Z'),
      }),
    },
    pointRecord: {
      create: async ({ data }: { data: { point: number; type: PointType } }) => {
        createdPoint = data;
      },
    },
  } as unknown as PrismaService;
  const access = {
    requireRole: async (_userId: string, _classroomId: string, roles: ClassRole[]) => {
      assert.deepEqual(roles, [ClassRole.HOMEROOM_TEACHER]);
    },
  } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  await service.create(
    'classroom-id',
    {
      classStudentId: 'enrollment-id',
      criterionId: 'criterion-id',
      weekId: 'week-id',
    },
    'teacher-id',
  );
  assert.equal((createdPoint as { point: number }).point, 2);
  assert.equal((createdPoint as { type: PointType }).type, PointType.BONUS);
});

test('rejects point adjustments because criterion values are fixed', async () => {
  let transactionStarted = false;
  const prisma = {
    pointRecord: {
      findUnique: async () => ({
        id: 'point-id',
        classroomId: 'classroom-id',
        point: new Prisma.Decimal(2),
        status: 'ACTIVE',
        week: { isClosed: false, endDate: new Date('2999-12-31T00:00:00.000Z') },
      }),
    },
    $transaction: async () => {
      transactionStarted = true;
    },
  } as unknown as PrismaService;
  const access = {
    requireRole: async (_userId: string, _classroomId: string, roles: ClassRole[]) => {
      assert.deepEqual(roles, [ClassRole.HOMEROOM_TEACHER]);
    },
  } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  await assert.rejects(
    service.adjust('point-id', { newPoint: 3, reason: 'correction' }, 'teacher-id'),
    /fixed by their criterion/i,
  );
  assert.equal(transactionStarted, false);
});

test('voids a point without deleting it and checks the week remains open atomically', async () => {
  let updateWhere: unknown;
  const prisma = {
    pointRecord: {
      findUnique: async () => ({
        id: 'point-id',
        classroomId: 'classroom-id',
        status: PointStatus.ACTIVE,
        week: { isClosed: false, endDate: new Date('2999-12-31T00:00:00.000Z') },
      }),
    },
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        pointRecord: {
          updateMany: async ({ where, data }: { where: unknown; data: { status: PointStatus } }) => {
            updateWhere = where;
            assert.equal(data.status, PointStatus.VOIDED);
            return { count: 1 };
          },
          findUniqueOrThrow: async () => ({ id: 'point-id', status: PointStatus.VOIDED }),
        },
      }),
  } as unknown as PrismaService;
  const access = {
    requireRole: async (_userId: string, _classroomId: string, roles: ClassRole[]) => {
      assert.deepEqual(roles, [ClassRole.HOMEROOM_TEACHER]);
    },
  } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  const result = await service.void('point-id', 'teacher-id');

  assert.equal((updateWhere as { id: string }).id, 'point-id');
  assert.equal((updateWhere as { status: PointStatus }).status, PointStatus.ACTIVE);
  const weekCondition = (updateWhere as { week: { is: { isClosed: boolean; endDate: { gte: Date } } } }).week.is;
  assert.equal(weekCondition.isClosed, false);
  assert.equal(weekCondition.endDate.gte.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
  assert.deepEqual(result, { id: 'point-id', status: PointStatus.VOIDED });
});

test('rejects point creation in a week that has already ended', async () => {
  let created = false;
  const prisma = {
    classStudent: { findFirst: async () => ({ id: 'enrollment-id' }) },
    criterion: {
      findFirst: async () => ({
        id: 'criterion-id',
        type: PointType.BONUS,
        defaultPoint: new Prisma.Decimal(2),
        minPoint: null,
        maxPoint: null,
      }),
    },
    competitionWeek: {
      findFirst: async () => ({
        id: 'week-id',
        isClosed: false,
        endDate: new Date('2000-01-02T00:00:00.000Z'),
      }),
    },
    pointRecord: { create: async () => { created = true; } },
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  await assert.rejects(
    service.create(
      'classroom-id',
      { classStudentId: 'enrollment-id', criterionId: 'criterion-id', weekId: 'week-id' },
      'teacher-id',
    ),
    ConflictException,
  );
  assert.equal(created, false);
});

test('rejects voiding a point from a week that has already ended', async () => {
  let transactionStarted = false;
  const prisma = {
    pointRecord: {
      findUnique: async () => ({
        id: 'point-id',
        classroomId: 'classroom-id',
        status: PointStatus.ACTIVE,
        week: { isClosed: false, endDate: new Date('2000-01-02T00:00:00.000Z') },
      }),
    },
    $transaction: async () => {
      transactionStarted = true;
    },
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  await assert.rejects(service.void('point-id', 'teacher-id'), ConflictException);
  assert.equal(transactionStarted, false);
});

test('rejects adjustments to points from a week that has already ended', async () => {
  const prisma = {
    pointRecord: {
      findUnique: async () => ({
        id: 'point-id',
        classroomId: 'classroom-id',
        point: new Prisma.Decimal(2),
        status: PointStatus.ACTIVE,
        week: { isClosed: false, endDate: new Date('2000-01-02T00:00:00.000Z') },
      }),
    },
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const service = new PointsService(prisma, access);

  await assert.rejects(
    service.adjust('point-id', { newPoint: 3, reason: 'correction' }, 'teacher-id'),
    /past competition week/i,
  );
});

test('returns a student own history including inactive enrollments', async () => {
  let queriedEnrollmentIds: string[] | undefined;
  const prisma = {
    student: {
      findUnique: async () => ({
        userId: 'student-user',
        classRecords: [
          { id: 'old-enrollment', classroomId: 'old-classroom', teamHistory: [] },
          { id: 'current-enrollment', classroomId: 'current-classroom', teamHistory: [] },
        ],
      }),
    },
    pointRecord: {
      findMany: async (args: { where: { classStudentId: { in: string[] } } }) => {
        queriedEnrollmentIds = args.where.classStudentId.in;
        return [];
      },
    },
  } as unknown as PrismaService;
  const service = new PointsService(prisma, {} as ClassroomAccessService);

  await service.findStudentHistory('student-id', 'student-user');

  assert.deepEqual(queriedEnrollmentIds, ['old-enrollment', 'current-enrollment']);
});

test('does not expose a student history to a leader from another team', async () => {
  const prisma = {
    student: {
      findUnique: async () => ({
        userId: 'target-user',
        classRecords: [
          {
            id: 'target-enrollment',
            classroomId: 'classroom-id',
            teamHistory: [{ teamId: 'target-team' }],
          },
        ],
      }),
    },
    classMembership: {
      findMany: async () => [{ classroomId: 'classroom-id', role: ClassRole.TEAM_LEADER }],
    },
    teamMembership: {
      findMany: async () => [{ teamId: 'leader-team' }],
    },
  } as unknown as PrismaService;
  const service = new PointsService(prisma, {} as ClassroomAccessService);

  await assert.rejects(
    service.findStudentHistory('student-id', 'leader-user'),
    NotFoundException,
  );
});

test('ranks teams by average net score using historical membership at point-entry time', async () => {
  const start = new Date('2026-09-07T00:00:00.000Z');
  const firstDay = new Date('2026-09-07T10:00:00.000Z');
  const secondDay = new Date('2026-09-08T10:00:00.000Z');
  const departedAt = new Date('2026-09-09T00:00:00.000Z');
  const prisma = {
    competitionWeek: {
      findFirst: async () => ({
        id: 'week-id',
        name: 'Week 1',
        startDate: start,
        endDate: new Date('2026-09-13T00:00:00.000Z'),
        classroom: { rankingMode: RankingMode.AVERAGE_SCORE },
      }),
    },
    classMembership: { findFirst: async () => ({ role: ClassRole.HOMEROOM_TEACHER }) },
    team: {
      findMany: async () => [
        {
          id: 'team-a',
          name: 'Team A',
          code: 'A',
          memberships: [
            { classStudentId: 'student-a', joinedAt: start, leftAt: null },
            { classStudentId: 'student-b', joinedAt: start, leftAt: departedAt },
          ],
        },
        {
          id: 'team-b',
          name: 'Team B',
          code: 'B',
          memberships: [{ classStudentId: 'student-c', joinedAt: start, leftAt: null }],
        },
        {
          id: 'team-c',
          name: 'Team C',
          code: 'C',
          memberships: [{ classStudentId: 'student-d', joinedAt: start, leftAt: null }],
        },
      ],
    },
    pointRecord: {
      findMany: async () => [
        {
          classStudentId: 'student-a',
          point: new Prisma.Decimal(10),
          type: PointType.BONUS,
          createdAt: firstDay,
        },
        {
          classStudentId: 'student-a',
          point: new Prisma.Decimal(2),
          type: PointType.PENALTY,
          createdAt: secondDay,
        },
        {
          classStudentId: 'student-b',
          point: new Prisma.Decimal(100),
          type: PointType.BONUS,
          createdAt: new Date('2026-09-10T10:00:00.000Z'),
        },
        {
          classStudentId: 'student-c',
          point: new Prisma.Decimal(4),
          type: PointType.BONUS,
          createdAt: firstDay,
        },
        {
          classStudentId: 'student-d',
          point: new Prisma.Decimal(5),
          type: PointType.BONUS,
          createdAt: firstDay,
        },
      ],
    },
  } as unknown as PrismaService;
  const service = new PointsService(prisma, {} as ClassroomAccessService);

  const result = await service.teamRankings('classroom-id', 'week-id', 'teacher-id');

  assert.deepEqual(
    result.rankings.map(({ teamCode, score, rank }) => ({
      teamCode,
      score: score.toString(),
      rank,
    })),
    [
      { teamCode: 'C', score: '5', rank: 1 },
      { teamCode: 'A', score: '4', rank: 2 },
      { teamCode: 'B', score: '4', rank: 2 },
    ],
  );
});
