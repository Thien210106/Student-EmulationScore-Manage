import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PasswordService } from '../../common/services/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassroomImportsService, UploadedWorkbook } from './classroom-imports.service';

const headers = [
  'TUẦN',
  'Họ và tên hs',
  'Họ và tên hs',
  'Phát biểu (+2)',
  'Nói chuyện (-2)',
  'Tổng',
];

async function workbookFile(): Promise<UploadedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const teamOne = workbook.addWorksheet('TỔ 1');
  teamOne.addRow(headers);
  teamOne.addRow([1, 'Nguyễn Văn', 'An', 2, null, 2]);
  teamOne.addRow([2, 'Nguyễn Văn', 'An', null, 1, -2]);
  teamOne.addRow([2, 'Trần Thị Bình', null, null, 1, -2]);

  const teamTwo = workbook.addWorksheet('TỔ 2');
  teamTwo.addRow(headers);
  teamTwo.addRow([1, 'Lê Minh', 'Châu', 1, null, 2]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    size: buffer.length,
    originalname: 'class-tracking.xlsx',
  };
}

function createService(existingNames: string[] = []) {
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const prisma = {
    classStudent: {
      findMany: async () =>
        existingNames.map((fullName) => ({ student: { fullName } })),
    },
  } as unknown as PrismaService;
  return new ClassroomImportsService(prisma, access, new PasswordService());
}

test('previews distinct roster names, team sheets, and signed criteria without importing scores', async () => {
  const result = await createService(['Nguyễn Văn An']).preview(
    'classroom-id',
    'teacher-id',
    await workbookFile(),
  );

  assert.equal(result.studentCount, 3);
  assert.equal(result.newStudentCount, 2);
  assert.equal(result.existingStudentCount, 1);
  assert.equal(result.scoreHistoryImported, false);
  assert.deepEqual(result.teams.map(({ name, studentCount }) => [name, studentCount]), [
    ['TỔ 1', 2],
    ['TỔ 2', 1],
  ]);
  assert.deepEqual(
    result.criteria.map(({ name, type, defaultPoint }) => [name, type, defaultPoint]),
    [
      ['Phát biểu', 'BONUS', 2],
      ['Nói chuyện', 'PENALTY', 2],
    ],
  );
});

test('assigns cross-sheet students to the first team where their name appears', async () => {
  const workbook = new ExcelJS.Workbook();
  for (const teamName of ['TỔ 1', 'TỔ 2']) {
    const sheet = workbook.addWorksheet(teamName);
    sheet.addRow(headers);
    sheet.addRow([1, 'Nguyễn Văn', 'An', 1, null, 1]);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const file = {
    buffer,
    size: buffer.length,
    originalname: 'duplicate.xlsx',
  };

  const result = await createService().preview('classroom-id', 'teacher-id', file);
  assert.equal(result.studentCount, 1);
  assert.equal(result.ambiguousTeamAssignmentCount, 1);
  assert.deepEqual(result.teams.map(({ studentCount }) => studentCount), [1, 0]);
});

test('imports cross-sheet students into only their first listed team', async () => {
  const workbook = new ExcelJS.Workbook();
  for (const teamName of ['TỔ 1', 'TỔ 2']) {
    const sheet = workbook.addWorksheet(teamName);
    sheet.addRow(headers);
    sheet.addRow([1, 'Nguyễn Văn', 'An', 1, null, 1]);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const teamIds = new Map<string, string>();
  let createdMemberships: Array<{ teamId: string; classStudentId: string }> = [];
  const createMany = async ({ data }: { data: Array<Record<string, unknown>> }) => ({ count: data.length });
  const transaction = {
    team: {
      createMany: async ({ data }: { data: Array<{ id: string; code: string }> }) => {
        for (const team of data) teamIds.set(team.code, team.id);
        return { count: data.length };
      },
    },
    criterion: { createMany },
    user: { createMany },
    student: { createMany },
    classStudent: { createMany },
    classMembership: { createMany },
    teamMembership: {
      findMany: async () => [],
      createMany: async ({ data }: { data: Array<{ teamId: string; classStudentId: string }> }) => {
        createdMemberships = data;
        return { count: data.length };
      },
    },
  };
  const prisma = {
    classroom: { findFirst: async () => ({ id: 'classroom-id', code: 'CLASS' }) },
    classStudent: { findMany: async () => [] },
    team: { findMany: async () => [] },
    criterion: { findMany: async () => [] },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const passwords = { hash: async () => 'hashed-password' } as unknown as PasswordService;
  const service = new ClassroomImportsService(prisma, access, passwords);

  const result = await service.importWorkbook('classroom-id', 'teacher-id', {
    buffer,
    size: buffer.length,
    originalname: 'duplicate.xlsx',
  });

  assert.equal(result.createdMembershipCount, 1);
  assert.equal(createdMemberships.length, 1);
  assert.equal(createdMemberships[0].teamId, teamIds.get('T01'));
});

test('rejects worksheets whose score criteria differ', async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('TỔ 1');
  first.addRow(headers);
  first.addRow([1, 'Nguyễn Văn', 'An', 1, null, 1]);
  const second = workbook.addWorksheet('TỔ 2');
  second.addRow(['TUẦN', 'Họ và tên hs', 'Họ và tên hs', 'Phát biểu (+3)', 'Nói chuyện (-2)', 'Tổng']);
  second.addRow([1, 'Lê Minh', 'Châu', 1, null, 1]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const file = {
    buffer,
    size: buffer.length,
    originalname: 'mismatched.xlsx',
  };

  await assert.rejects(
    createService().preview('classroom-id', 'teacher-id', file),
    /criteria.*do not match/i,
  );
});

test('imports new students with bulk writes inside one transaction', async () => {
  const bulkWriteSizes: Record<string, number[]> = {};
  const recordWrite = (model: string) => async ({ data }: { data: unknown[] }) => {
    bulkWriteSizes[model] ??= [];
    bulkWriteSizes[model].push(data.length);
    return { count: data.length };
  };
  const transaction = {
    team: { createMany: recordWrite('team') },
    criterion: { createMany: recordWrite('criterion') },
    user: { createMany: recordWrite('user') },
    student: { createMany: recordWrite('student') },
    classStudent: { createMany: recordWrite('classStudent') },
    classMembership: { createMany: recordWrite('classMembership') },
    teamMembership: {
      findMany: async () => [],
      createMany: recordWrite('teamMembership'),
    },
  };
  let transactionCount = 0;
  const prisma = {
    classroom: { findFirst: async () => ({ id: 'classroom-id', code: 'CLASS' }) },
    classStudent: { findMany: async () => [] },
    team: { findMany: async () => [] },
    criterion: { findMany: async () => [] },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      transactionCount += 1;
      return callback(transaction);
    },
  } as unknown as PrismaService;
  const access = { requireRole: async () => undefined } as unknown as ClassroomAccessService;
  const passwords = { hash: async () => 'hashed-password' } as unknown as PasswordService;
  const service = new ClassroomImportsService(prisma, access, passwords);

  const result = await service.importWorkbook(
    'classroom-id',
    'teacher-id',
    await workbookFile(),
  );

  assert.equal(transactionCount, 1);
  assert.equal(result.createdStudentCount, 3);
  assert.equal(result.createdTeamCount, 2);
  assert.equal(result.createdCriterionCount, 2);
  assert.equal(result.createdMembershipCount, 3);
  assert.equal(result.credentials.length, 3);
  assert.deepEqual(bulkWriteSizes, {
    team: [2],
    criterion: [2],
    user: [3],
    student: [3],
    classStudent: [3],
    classMembership: [3],
    teamMembership: [3],
  });
});
