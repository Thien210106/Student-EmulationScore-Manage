import ExcelJS from 'exceljs';
import { resolve } from 'node:path';

async function createTemplate(): Promise<void> {
  const [outputPath, ...extraArgs] = process.argv.slice(2);
  if (!outputPath || extraArgs.length > 0) {
    throw new Error('Usage: npm run prisma:criteria-template -- <output.xlsx>');
  }
  if (!outputPath.toLowerCase().endsWith('.xlsx')) {
    throw new Error('The template output path must end with .xlsx');
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Criteria');
  worksheet.columns = [
    { header: 'code', key: 'code', width: 20 },
    { header: 'name', key: 'name', width: 32 },
    { header: 'type', key: 'type', width: 16 },
    { header: 'defaultPoint', key: 'defaultPoint', width: 18 },
    { header: 'minPoint', key: 'minPoint', width: 16 },
    { header: 'maxPoint', key: 'maxPoint', width: 16 },
    { header: 'description', key: 'description', width: 48 },
    { header: 'sortOrder', key: 'sortOrder', width: 14 },
  ];
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: 'H1' };

  await workbook.xlsx.writeFile(resolve(outputPath));
  console.info(`Created blank criteria template at ${resolve(outputPath)}.`);
}

createTemplate().catch((error: unknown) => {
  console.error('Criteria template creation failed:', error);
  process.exitCode = 1;
});
