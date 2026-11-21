import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AcademicYearsService } from './academic-years.service';

test('creates an active academic year with date-only values', async () => {
  let createdData: Record<string, unknown> | undefined;
  const prisma = {
    academicYear: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return { id: 'year-id', ...data };
      },
    },
  } as unknown as PrismaService;
  const service = new AcademicYearsService(prisma);

  await service.create({
    name: '  2026-2027  ',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
  });

  assert.deepEqual(createdData, {
    name: '2026-2027',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2027-06-30T00:00:00.000Z'),
    isActive: true,
  });
});

test('rejects academic years whose end date is not after their start date', async () => {
  const service = new AcademicYearsService({} as PrismaService);

  await assert.rejects(
    service.create({
      name: '2026-2027',
      startDate: '2027-06-30',
      endDate: '2026-09-01',
    }),
    BadRequestException,
  );
});
