import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';

const prisma = new PrismaClient();
const requiredHeaders = ['code', 'name', 'type', 'defaultpoint'] as const;
const optionalHeaders = ['minpoint', 'maxpoint', 'description', 'sortorder'] as const;

type CriterionType = 'BONUS' | 'PENALTY';

interface ImportedCriterion {
  code: string;
  name: string;
  type: CriterionType;
  defaultPoint: Prisma.Decimal;
  minPoint: Prisma.Decimal | null;
  maxPoint: Prisma.Decimal | null;
  description: string | null;
  sortOrder: number;
}

function cellText(cell: ExcelJS.Cell, rowNumber: number, header: string): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  throw new Error(`Row ${rowNumber}: "${header}" must be a plain text or numeric cell`);
}

function parsePoint(
  value: string,
  rowNumber: number,
  header: string,
  required: true,
): Prisma.Decimal;
function parsePoint(
  value: string,
  rowNumber: number,
  header: string,
  required: false,
): Prisma.Decimal | null;
function parsePoint(
  value: string,
  rowNumber: number,
  header: string,
  required: boolean,
): Prisma.Decimal | null {
  if (!value) {
    if (required) {
      throw new Error(`Row ${rowNumber}: "${header}" is required`);
    }
    return null;
  }

  let point: Prisma.Decimal;
  try {
    point = new Prisma.Decimal(value);
  } catch {
    throw new Error(`Row ${rowNumber}: "${header}" must be a valid decimal number`);
  }

  if (!point.isFinite() || point.decimalPlaces() > 2 || point.abs().greaterThan('999999.99')) {
    throw new Error(`Row ${rowNumber}: "${header}" must fit DECIMAL(8,2)`);
  }
  if (point.isNegative()) {
    throw new Error(`Row ${rowNumber}: "${header}" cannot be negative`);
  }
  return point;
}

export function parseWorkbook(worksheet: ExcelJS.Worksheet): ImportedCriterion[] {
  const headerRow = worksheet.getRow(1);
  const headers = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = cellText(cell, 1, 'header').toLowerCase();
    if (header && headers.has(header)) {
      throw new Error(`Duplicate column header "${header}"`);
    }
    if (header) {
      headers.set(header, columnNumber);
    }
  });

  for (const header of requiredHeaders) {
    if (!headers.has(header)) {
      throw new Error(`Missing required column header "${header}"`);
    }
  }
  for (const header of optionalHeaders) {
    if (!headers.has(header)) {
      console.warn(`Optional column "${header}" is missing; using its default value.`);
    }
  }

  const rows: ImportedCriterion[] = [];
  const seenCodes = new Set<string>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = new Map<string, string>();
    for (const [header, columnNumber] of headers) {
      values.set(header, cellText(row.getCell(columnNumber), rowNumber, header));
    }
    if ([...values.values()].every((value) => value === '')) {
      continue;
    }

    const code = values.get('code') ?? '';
    const name = values.get('name') ?? '';
    const typeValue = (values.get('type') ?? '').toUpperCase();
    if (!code || code.length > 40) {
      throw new Error(`Row ${rowNumber}: "code" is required and must be at most 40 characters`);
    }
    if (!name || name.length > 150) {
      throw new Error(`Row ${rowNumber}: "name" is required and must be at most 150 characters`);
    }
    if (typeValue !== 'BONUS' && typeValue !== 'PENALTY') {
      throw new Error(`Row ${rowNumber}: "type" must be BONUS or PENALTY`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Row ${rowNumber}: duplicate criterion code "${code}" in workbook`);
    }
    seenCodes.add(code);

    const defaultPoint = parsePoint(values.get('defaultpoint') ?? '', rowNumber, 'defaultPoint', true);
    const minPoint = parsePoint(values.get('minpoint') ?? '', rowNumber, 'minPoint', false);
    const maxPoint = parsePoint(values.get('maxpoint') ?? '', rowNumber, 'maxPoint', false);
    if (minPoint && maxPoint && minPoint.greaterThan(maxPoint)) {
      throw new Error(`Row ${rowNumber}: "minPoint" cannot exceed "maxPoint"`);
    }
    if (minPoint && defaultPoint.lessThan(minPoint)) {
      throw new Error(`Row ${rowNumber}: "defaultPoint" cannot be less than "minPoint"`);
    }
    if (maxPoint && defaultPoint.greaterThan(maxPoint)) {
      throw new Error(`Row ${rowNumber}: "defaultPoint" cannot exceed "maxPoint"`);
    }

    const description = values.get('description') || null;
    if (description && description.length > 65535) {
      throw new Error(`Row ${rowNumber}: "description" is too long`);
    }
    const sortOrderText = values.get('sortorder') ?? '';
    const sortOrder = sortOrderText ? Number(sortOrderText) : 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483647) {
      throw new Error(`Row ${rowNumber}: "sortOrder" must be a non-negative integer`);
    }

    rows.push({
      code,
      name,
      type: typeValue,
      defaultPoint,
      minPoint,
      maxPoint,
      description,
      sortOrder,
    });
  }

  if (rows.length === 0) {
    throw new Error('The workbook contains no criterion rows to import');
  }
  return rows;
}

async function importCriteria(): Promise<void> {
  const [workbookPath, classroomId, ...extraArgs] = process.argv.slice(2);
  if (!workbookPath || !classroomId || extraArgs.length > 0) {
    throw new Error(
      'Usage: npm run prisma:import-criteria -- <workbook.xlsx> <classroom-uuid>',
    );
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classroomId)) {
    throw new Error('classroomId must be a valid UUID');
  }

  const absolutePath = resolve(workbookPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('The workbook has no worksheets');
  }
  const criteria = parseWorkbook(worksheet);

  await prisma.$transaction(async (transaction) => {
    const classroom = await transaction.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true },
    });
    if (!classroom) {
      throw new Error(`Classroom "${classroomId}" does not exist`);
    }

    const existing = await transaction.criterion.findMany({
      where: {
        classroomId,
        code: { in: criteria.map(({ code }) => code) },
      },
      select: { code: true },
    });
    if (existing.length > 0) {
      throw new Error(
        `These criterion codes already exist in the classroom: ${existing.map(({ code }) => code).join(', ')}`,
      );
    }

    await transaction.criterion.createMany({
      data: criteria.map((criterion) => ({ ...criterion, classroomId })),
    });
  });

  console.info(`Imported ${criteria.length} criteria into classroom ${classroomId}.`);
}

if (require.main === module) {
  importCriteria()
    .catch((error: unknown) => {
      console.error('Criteria import failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
