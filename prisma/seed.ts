import 'dotenv/config';
import { ClassRole, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseDate(name: string): Date {
  const value = requiredEnv(name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid calendar date`);
  }
  return parsed;
}

function validatePasswordHash(hash: string): void {
  const isBcrypt = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
  const isArgon2 =
    /^\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.test(
      hash,
    );
  if (!isBcrypt && !isArgon2) {
    throw new Error(
      'SEED_TEACHER_PASSWORD_HASH must be a bcrypt or Argon2 hash; plain-text passwords are not accepted',
    );
  }
}

async function seed(): Promise<void> {
  const academicYearName = requiredEnv('SEED_ACADEMIC_YEAR_NAME');
  const academicYearStart = parseDate('SEED_ACADEMIC_YEAR_START_DATE');
  const academicYearEnd = parseDate('SEED_ACADEMIC_YEAR_END_DATE');
  const classroomName = requiredEnv('SEED_CLASSROOM_NAME');
  const classroomCode = requiredEnv('SEED_CLASSROOM_CODE');
  const username = requiredEnv('SEED_TEACHER_USERNAME').toLowerCase();
  const email = requiredEnv('SEED_TEACHER_EMAIL').toLowerCase();
  const fullName = requiredEnv('SEED_TEACHER_FULL_NAME');
  const passwordHash = requiredEnv('SEED_TEACHER_PASSWORD_HASH');

  if (academicYearStart >= academicYearEnd) {
    throw new Error('The academic year start date must be before its end date');
  }
  validatePasswordHash(passwordHash);

  await prisma.$transaction(async (transaction) => {
    const academicYear = await transaction.academicYear.upsert({
      where: { name: academicYearName },
      create: {
        name: academicYearName,
        startDate: academicYearStart,
        endDate: academicYearEnd,
        isActive: true,
      },
      update: {},
    });

    if (
      academicYear.startDate.getTime() !== academicYearStart.getTime() ||
      academicYear.endDate.getTime() !== academicYearEnd.getTime()
    ) {
      throw new Error(`Academic year "${academicYearName}" already exists with different dates`);
    }

    const classroom = await transaction.classroom.upsert({
      where: {
        academicYearId_code: {
          academicYearId: academicYear.id,
          code: classroomCode,
        },
      },
      create: {
        name: classroomName,
        code: classroomCode,
        academicYearId: academicYear.id,
      },
      update: {},
    });

    const teacher = await transaction.user.upsert({
      where: { username },
      create: {
        username,
        email,
        fullName,
        passwordHash,
      },
      update: {},
    });

    if (teacher.email !== email) {
      throw new Error(`Teacher username "${username}" already exists with a different email`);
    }

    const membership = await transaction.classMembership.findUnique({
      where: {
        userId_classroomId: {
          userId: teacher.id,
          classroomId: classroom.id,
        },
      },
    });

    if (
      membership &&
      (membership.role !== ClassRole.HOMEROOM_TEACHER || !membership.isActive)
    ) {
      throw new Error('Existing teacher membership is inactive or has a different role');
    }

    if (!membership) {
      await transaction.classMembership.create({
        data: {
          userId: teacher.id,
          classroomId: classroom.id,
          role: ClassRole.HOMEROOM_TEACHER,
        },
      });
    }

    console.info(`Seeded academic year "${academicYear.name}" and classroom "${classroom.code}".`);
  });
}

seed()
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
