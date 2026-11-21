import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { parseWorkbook } from './import-criteria';

function createWorksheet(rows: unknown[][]): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Criteria');
  for (const row of rows) {
    worksheet.addRow(row);
  }
  return worksheet;
}

const headers = [
  'code',
  'name',
  'type',
  'defaultPoint',
  'minPoint',
  'maxPoint',
  'description',
  'sortOrder',
];

test('parses valid criteria without altering decimal values', () => {
  const worksheet = createWorksheet([
    headers,
    ['C-01', 'Criterion from test fixture', 'bonus', '1.25', '0', '2', 'test only', '3'],
  ]);

  const [criterion] = parseWorkbook(worksheet);
  assert.equal(criterion.code, 'C-01');
  assert.equal(criterion.type, 'BONUS');
  assert.equal(criterion.defaultPoint.toString(), '1.25');
  assert.equal(criterion.sortOrder, 3);
});

test('rejects duplicate criterion codes in a workbook', () => {
  const worksheet = createWorksheet([
    headers,
    ['C-01', 'Test one', 'BONUS', '1'],
    ['C-01', 'Test two', 'PENALTY', '1'],
  ]);

  assert.throws(() => parseWorkbook(worksheet), /duplicate criterion code/i);
});

test('rejects defaults outside configured point bounds', () => {
  const worksheet = createWorksheet([
    headers,
    ['C-01', 'Test only', 'BONUS', '3', '0', '2'],
  ]);

  assert.throws(() => parseWorkbook(worksheet), /cannot exceed "maxPoint"/);
});

test('rejects formula cells instead of importing untrusted calculated values', () => {
  const worksheet = createWorksheet([headers, ['C-01', 'Test only', 'BONUS', '1']]);
  worksheet.getCell('B2').value = { formula: '1+1', result: 'Test only' };

  assert.throws(() => parseWorkbook(worksheet), /plain text or numeric cell/i);
});
