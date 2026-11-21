import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClassRole, PointType, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from './reports.service';

function createTeacherPrisma() {
  const week = {
    id: 'week-id',
    name: 'Week 1',
    startDate: new Date('2026-09-07T00:00:00.000Z'),
    endDate: new Date('2026-09-13T00:00:00.000Z'),
    classroom: { name: 'Class 1', code: 'C1' },
  };
  const enrollments = [
    { id: 'enrollment-1', student: { studentCode: 'S1', fullName: 'Student One' } },
    { id: 'enrollment-2', student: { studentCode: 'S2', fullName: 'Student Two' } },
    { id: 'enrollment-3', student: { studentCode: 'S3', fullName: 'Student Three' } },
  ];
  const prisma = {
    competitionWeek: { findFirst: async () => week },
    classMembership: { findFirst: async () => ({ role: ClassRole.HOMEROOM_TEACHER }) },
    classStudent: { findMany: async () => enrollments },
    pointRecord: {
      findMany: async () => [
        { classStudentId: 'enrollment-1', point: new Prisma.Decimal(10), type: PointType.BONUS },
        { classStudentId: 'enrollment-1', point: new Prisma.Decimal(3), type: PointType.PENALTY },
        { classStudentId: 'enrollment-2', point: new Prisma.Decimal(7), type: PointType.BONUS },
        { classStudentId: 'enrollment-3', point: new Prisma.Decimal(0), type: PointType.BONUS },
      ],
    },
    classificationRule: {
      findMany: async () => [
        {
          name: 'Excellent',
          minScore: new Prisma.Decimal(7),
          maxScore: null,
        },
        {
          name: 'Good',
          minScore: new Prisma.Decimal(0),
          maxScore: new Prisma.Decimal(7),
        },
      ],
    },
  } as unknown as PrismaService;
  return { prisma, enrollments };
}

test('calculates role-scoped weekly net scores, classifications and competition ranks', async () => {
  const { prisma } = createTeacherPrisma();
  const service = new ReportsService(prisma);

  const report = await service.weeklyStudents('classroom-id', 'week-id', 'teacher-id');

  assert.deepEqual(
    report.results.map(({ studentCode, bonusPoints, penaltyPoints, netScore, classification, rank }) => ({
      studentCode,
      bonusPoints: bonusPoints.toString(),
      penaltyPoints: penaltyPoints.toString(),
      netScore: netScore.toString(),
      classification,
      rank,
    })),
    [
      {
        studentCode: 'S1',
        bonusPoints: '10',
        penaltyPoints: '3',
        netScore: '7',
        classification: 'Excellent',
        rank: 1,
      },
      {
        studentCode: 'S2',
        bonusPoints: '7',
        penaltyPoints: '0',
        netScore: '7',
        classification: 'Excellent',
        rank: 1,
      },
      {
        studentCode: 'S3',
        bonusPoints: '0',
        penaltyPoints: '0',
        netScore: '0',
        classification: 'Good',
        rank: 3,
      },
    ],
  );
});

test('limits a student report to their own enrollment and points', async () => {
  let queriedAllWeeklyEnrollments = false;
  let queriedAllWeekPoints = false;
  const { prisma: base } = createTeacherPrisma();
  const prisma = {
    ...base,
    classMembership: { findFirst: async () => ({ role: ClassRole.STUDENT }) },
    classStudent: {
      findFirst: async () => ({ id: 'enrollment-2' }),
      findMany: async (args: { where: { joinedAt?: { lt: Date }; id?: unknown } }) => {
        queriedAllWeeklyEnrollments = args.where.joinedAt !== undefined && args.where.id === undefined;
        return [
          { id: 'enrollment-1', student: { studentCode: 'S1', fullName: 'Student One' } },
          { id: 'enrollment-2', student: { studentCode: 'S2', fullName: 'Student Two' } },
          { id: 'enrollment-3', student: { studentCode: 'S3', fullName: 'Student Three' } },
        ];
      },
    },
    pointRecord: {
      findMany: async (args: { where: { classStudentId?: unknown } }) => {
        queriedAllWeekPoints = args.where.classStudentId === undefined;
        return [
          { classStudentId: 'enrollment-1', point: new Prisma.Decimal(11), type: PointType.BONUS },
          { classStudentId: 'enrollment-2', point: new Prisma.Decimal(7), type: PointType.BONUS },
          { classStudentId: 'enrollment-3', point: new Prisma.Decimal(0), type: PointType.BONUS },
        ];
      },
    },
  } as unknown as PrismaService;
  const service = new ReportsService(prisma);

  const report = await service.weeklyStudents('classroom-id', 'week-id', 'student-user-id');

  assert.equal(queriedAllWeeklyEnrollments, true);
  assert.equal(queriedAllWeekPoints, true);
  assert.deepEqual(
    report.results.map(({ studentCode, rank }) => [studentCode, rank]),
    [['S2', 2]],
  );
});

test('limits a team leader report to members of their current team', async () => {
  let queriedAllWeeklyEnrollments = false;
  const { prisma: base } = createTeacherPrisma();
  const prisma = {
    ...base,
    classMembership: { findFirst: async () => ({ role: ClassRole.TEAM_LEADER }) },
    classStudent: {
      findFirst: async () => ({ id: 'leader-enrollment' }),
      findMany: async (args: { where: { joinedAt?: { lt: Date }; id?: unknown } }) => {
        queriedAllWeeklyEnrollments = args.where.joinedAt !== undefined && args.where.id === undefined;
        return [
          { id: 'leader-enrollment', student: { studentCode: 'L1', fullName: 'Leader' } },
          { id: 'member-enrollment', student: { studentCode: 'M1', fullName: 'Member' } },
          { id: 'other-enrollment', student: { studentCode: 'O1', fullName: 'Other' } },
        ];
      },
    },
    teamMembership: {
      findMany: async (args: {
        where: { classStudentId?: string; teamId?: { in: string[] } };
      }) =>
        args.where.classStudentId
          ? [{ teamId: 'team-id' }]
          : [{ classStudentId: 'leader-enrollment' }, { classStudentId: 'member-enrollment' }],
    },
    pointRecord: {
      findMany: async () => [
        {
          classStudentId: 'other-enrollment',
          point: new Prisma.Decimal(10),
          type: PointType.BONUS,
        },
        {
          classStudentId: 'member-enrollment',
          point: new Prisma.Decimal(5),
          type: PointType.BONUS,
        },
      ],
    },
  } as unknown as PrismaService;
  const service = new ReportsService(prisma);

  const report = await service.weeklyStudents('classroom-id', 'week-id', 'leader-user-id');

  assert.equal(queriedAllWeeklyEnrollments, true);
  assert.deepEqual(
    report.results.map(({ studentCode, netScore, rank }) => [
      studentCode,
      netScore.toString(),
      rank,
    ]),
    [['M1', '5', 2], ['L1', '0', 3]],
  );
});

test('exports a valid Excel workbook with the weekly report columns and rows', async () => {
  const { prisma } = createTeacherPrisma();
  const service = new ReportsService(prisma);

  const buffer = await service.exportWeeklyStudents('classroom-id', 'week-id', 'teacher-id');
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.getWorksheet('Weekly report');

  assert.ok(sheet);
  assert.equal(sheet.getCell('A1').value, 'Weekly student report');
  assert.equal(sheet.getCell('A4').value, 'Rank');
  assert.equal(sheet.getCell('B4').value, 'Student code');
  assert.equal(sheet.getCell('F5').value, 7);
  assert.equal(sheet.getCell('G5').value, 'Excellent');
  assert.equal(sheet.rowCount, 7);
});
