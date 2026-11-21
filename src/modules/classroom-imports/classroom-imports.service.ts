import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, CriterionType, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PasswordService } from '../../common/services/password.service';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_STUDENTS = 300;

export interface ImportedCriterion {
  code: string;
  name: string;
  type: CriterionType;
  defaultPoint: number;
  sortOrder: number;
}

interface ImportedStudent {
  fullName: string;
  normalizedName: string;
  studentCode: string;
  teamCode: string;
  teamName: string;
}

interface ImportedTeam {
  code: string;
  name: string;
  students: ImportedStudent[];
}

interface ParsedWorkbook {
  teams: ImportedTeam[];
  students: ImportedStudent[];
  criteria: ImportedCriterion[];
  ambiguousTeamAssignmentCount: number;
}

export interface UploadedWorkbook {
  buffer: Buffer;
  size: number;
  originalname: string;
}

interface PreparedStudent extends ImportedStudent {
  userId: string;
  profileId: string;
  enrollmentId: string;
  membershipId: string;
  username: string;
  email: string;
  password: string;
  passwordHash: string;
}

@Injectable()
export class ClassroomImportsService {
  private readonly logger = new Logger(ClassroomImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
    private readonly passwords: PasswordService,
  ) {}

  async preview(classroomId: string, userId: string, file: UploadedWorkbook) {
    await this.requireImportFile(classroomId, userId, file);
    const parsed = await this.parse(file);
    const existing = await this.prisma.classStudent.findMany({
      where: { classroomId, isActive: true },
      select: { student: { select: { fullName: true } } },
    });
    const existingNames = new Set(
      existing.map(({ student }) => this.normalizeName(student.fullName)),
    );
    const newStudents = parsed.students.filter(
      (student) => !existingNames.has(student.normalizedName),
    );

    return {
      teams: parsed.teams.map(({ code, name, students }) => ({ code, name, studentCount: students.length })),
      studentCount: parsed.students.length,
      newStudentCount: newStudents.length,
      existingStudentCount: parsed.students.length - newStudents.length,
      ambiguousTeamAssignmentCount: parsed.ambiguousTeamAssignmentCount,
      criteria: parsed.criteria,
      scoreHistoryImported: false,
    };
  }

  async importWorkbook(classroomId: string, userId: string, file: UploadedWorkbook) {
    await this.requireImportFile(classroomId, userId, file);
    const parsed = await this.parse(file);
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, isActive: true },
      select: { id: true, code: true },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const existingStudents = await this.prisma.classStudent.findMany({
      where: { classroomId },
      select: {
        id: true,
        isActive: true,
        student: {
          select: {
            fullName: true,
            userId: true,
          },
        },
      },
    });
    const existingByName = new Map<string, (typeof existingStudents)[number]>();
    for (const enrollment of existingStudents) {
      const key = this.normalizeName(enrollment.student.fullName);
      if (existingByName.has(key)) {
        throw new ConflictException(
          `More than one existing student matches "${enrollment.student.fullName}". Resolve duplicate names before importing.`,
        );
      }
      existingByName.set(key, enrollment);
    }

    const existingNames = new Set(existingByName.keys());
    const incoming = parsed.students;
    const newStudents = incoming.filter((student) => !existingNames.has(student.normalizedName));
    const preparedStudents = await this.prepareNewStudents(newStudents);

    const teamCodes = parsed.teams.map(({ code }) => code);
    const criterionCodes = parsed.criteria.map(({ code }) => code);
    const [existingTeams, existingCriteria] = await Promise.all([
      this.prisma.team.findMany({
        where: { classroomId, code: { in: teamCodes } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.criterion.findMany({
        where: { classroomId, code: { in: criterionCodes } },
        select: { code: true, name: true, type: true, defaultPoint: true },
      }),
    ]);

    for (const team of parsed.teams) {
      const match = existingTeams.find(({ code }) => code === team.code);
      if (match && match.name !== team.name) {
        throw new ConflictException(
          `Team code ${team.code} already belongs to "${match.name}", not "${team.name}".`,
        );
      }
    }
    for (const criterion of parsed.criteria) {
      const match = existingCriteria.find(({ code }) => code === criterion.code);
      if (
        match &&
        (match.name !== criterion.name ||
          match.type !== criterion.type ||
          !match.defaultPoint.equals(criterion.defaultPoint))
      ) {
        throw new ConflictException(
          `Criterion "${criterion.name}" conflicts with existing criterion code ${criterion.code}.`,
        );
      }
    }

    const existingTeamByCode = new Map(existingTeams.map((team) => [team.code, team]));
    const teamIdByCode = new Map(
      parsed.teams.map((team) => [
        team.code,
        existingTeamByCode.get(team.code)?.id ?? randomUUID(),
      ]),
    );
    const existingCriterionCodes = new Set(existingCriteria.map(({ code }) => code));
    const credentialByName = new Map(
      preparedStudents.map((student) => [student.normalizedName, student]),
    );

    try {
      const result = await this.prisma.$transaction(
        async (transaction) => {
          const newTeams = parsed.teams.filter(
            ({ code }) => !existingTeamByCode.has(code),
          );
          if (newTeams.length) {
            await transaction.team.createMany({
              data: newTeams.map(({ code, name }) => ({
                id: teamIdByCode.get(code)!,
                classroomId,
                code,
                name,
              })),
            });
          }

          const newCriteria = parsed.criteria.filter(
            ({ code }) => !existingCriterionCodes.has(code),
          );
          if (newCriteria.length) {
            await transaction.criterion.createMany({
              data: newCriteria.map((criterion) => ({
                classroomId,
                code: criterion.code,
                name: criterion.name,
                type: criterion.type,
                defaultPoint: criterion.defaultPoint,
                minPoint: null,
                maxPoint: null,
                sortOrder: criterion.sortOrder,
              })),
            });
          }

          let createdStudentCount = 0;
          const inactiveEnrollments = existingStudents.filter(
            (enrollment) =>
              !enrollment.isActive &&
              incoming.some(
                (student) =>
                  this.normalizeName(enrollment.student.fullName) === student.normalizedName,
              ),
          );
          if (inactiveEnrollments.length) {
            const inactiveEnrollmentIds = inactiveEnrollments.map(({ id }) => id);
            await transaction.classStudent.updateMany({
              where: { id: { in: inactiveEnrollmentIds } },
              data: { isActive: true },
            });
            await transaction.classMembership.updateMany({
              where: {
                userId: {
                  in: inactiveEnrollments.map(({ student }) => student.userId),
                },
                classroomId,
              },
              data: { isActive: true },
            });
          }
          const reactivatedStudentCount = inactiveEnrollments.length;
          let createdMembershipCount = 0;
          const credentials: Array<{
            studentCode: string;
            fullName: string;
            username: string;
            password: string;
          }> = [];
          if (preparedStudents.length) {
            await transaction.user.createMany({
              data: preparedStudents.map((student) => ({
                id: student.userId,
                username: student.username,
                email: student.email,
                fullName: student.fullName,
                passwordHash: student.passwordHash,
              })),
            });
            await transaction.student.createMany({
              data: preparedStudents.map((student) => ({
                id: student.profileId,
                userId: student.userId,
                studentCode: student.studentCode,
                fullName: student.fullName,
              })),
            });
            await transaction.classStudent.createMany({
              data: preparedStudents.map((student) => ({
                id: student.enrollmentId,
                studentId: student.profileId,
                classroomId,
              })),
            });
            await transaction.classMembership.createMany({
              data: preparedStudents.map((student) => ({
                id: student.membershipId,
                userId: student.userId,
                classroomId,
                role: ClassRole.STUDENT,
              })),
            });
            createdStudentCount = preparedStudents.length;
            credentials.push(
              ...preparedStudents.map((student) => ({
                studentCode: student.studentCode,
                fullName: student.fullName,
                username: student.username,
                password: student.password,
              })),
            );
          }

          const enrollments = new Map(
            parsed.students.map((student) => {
              const prepared = credentialByName.get(student.normalizedName);
              const existing = existingByName.get(student.normalizedName);
              return [
                student.normalizedName,
                {
                  id: prepared?.enrollmentId ?? existing?.id,
                  userId: prepared?.userId ?? existing?.student.userId,
                },
              ];
            }),
          );
          const existingTeamMemberships = await transaction.teamMembership.findMany({
            where: {
              classStudentId: {
                in: [...enrollments.values()].flatMap(({ id }) => (id ? [id] : [])),
              },
              leftAt: null,
            },
            select: { classStudentId: true, teamId: true },
          });
          const teamByStudentId = new Map<string, string>();
          for (const membership of existingTeamMemberships) {
            teamByStudentId.set(membership.classStudentId, membership.teamId);
          }
          const newMemberships: Array<{ teamId: string; classStudentId: string }> = [];
          for (const team of parsed.teams) {
            const teamId = teamIdByCode.get(team.code);
            if (!teamId) continue;
            for (const student of team.students) {
              const enrollment = enrollments.get(student.normalizedName);
              if (!enrollment?.id) continue;
              const currentTeamId = teamByStudentId.get(enrollment.id);
              if (currentTeamId && currentTeamId !== teamId) {
                throw new ConflictException(
                  `Student "${student.fullName}" already belongs to another active team.`,
                );
              }
              if (!currentTeamId) {
                newMemberships.push({ teamId, classStudentId: enrollment.id });
              }
            }
          }
          if (newMemberships.length) {
            await transaction.teamMembership.createMany({ data: newMemberships });
            createdMembershipCount = newMemberships.length;
          }

          return {
            createdStudentCount,
            reactivatedStudentCount,
            createdTeamCount: parsed.teams.filter(({ code }) => !existingTeamByCode.has(code)).length,
            createdCriterionCount: newCriteria.length,
            createdMembershipCount,
            credentials,
          };
        },
        { maxWait: 10000, timeout: 60000 },
      );
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Some imported student, team, or criterion codes already exist. Refresh the class data and preview the file again.',
        );
      }
      throw error;
    }
  }

  private async requireImportFile(
    classroomId: string,
    userId: string,
    file: UploadedWorkbook,
  ): Promise<void> {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Select an .xlsx workbook to import.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('The workbook must be 10 MB or smaller.');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx workbooks are supported.');
    }
  }

  private async parse(file: UploadedWorkbook): Promise<ParsedWorkbook> {
    try {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = new ArrayBuffer(file.buffer.byteLength);
      new Uint8Array(arrayBuffer).set(file.buffer);
      await workbook.xlsx.load(arrayBuffer);
      if (workbook.worksheets.length > MAX_SHEETS) {
        throw new BadRequestException(`The workbook cannot contain more than ${MAX_SHEETS} sheets.`);
      }

      const teams: ImportedTeam[] = [];
      let criteria: ImportedCriterion[] | undefined;
      const allStudents = new Map<string, ImportedStudent>();
      const assignments = new Map<string, Set<string>>();

      for (const worksheet of workbook.worksheets) {
        if (worksheet.actualRowCount === 0) continue;
        if (worksheet.actualRowCount > MAX_ROWS_PER_SHEET) {
          throw new BadRequestException(
            `Sheet "${worksheet.name}" exceeds the ${MAX_ROWS_PER_SHEET}-row limit.`,
          );
        }

        const sheetCriteria = this.parseCriteria(worksheet);
        if (criteria && !this.sameCriteria(criteria, sheetCriteria)) {
          throw new BadRequestException(
            `Scoring criteria in sheet "${worksheet.name}" do not match the other sheets.`,
          );
        }
        criteria ??= sheetCriteria;

        const teamIndex = teams.length + 1;
        const teamCode = `T${String(teamIndex).padStart(2, '0')}`;
        const teamName = worksheet.name.trim();
        if (!teamName || teamName.length > 100) {
          throw new BadRequestException(`Sheet "${worksheet.name}" must have a team name up to 100 characters.`);
        }
        const teamStudentNames = new Set<string>();

        for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const firstPart = this.cellText(row.getCell(2), worksheet.name, rowNumber);
          const secondPart = this.cellText(row.getCell(3), worksheet.name, rowNumber);
          const fullName = [firstPart, secondPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
          if (!fullName || /họ\s*và\s*tên\s*hs/i.test(fullName)) continue;
          if (fullName.length > 150) {
            throw new BadRequestException(`Sheet "${worksheet.name}", row ${rowNumber}: student name is too long.`);
          }

          const normalizedName = this.normalizeName(fullName);
          if (!teamStudentNames.has(normalizedName)) {
            teamStudentNames.add(normalizedName);
            let student = allStudents.get(normalizedName);
            if (!student) {
              student = {
                fullName,
                normalizedName,
                studentCode: `IMP-${randomUUID().slice(0, 8).toUpperCase()}-${teamCode}-${String(allStudents.size + 1).padStart(3, '0')}`,
                teamCode,
                teamName,
              };
              allStudents.set(normalizedName, student);
            }
            const teamAssignments = assignments.get(normalizedName) ?? new Set<string>();
            teamAssignments.add(teamCode);
            assignments.set(normalizedName, teamAssignments);
          }
        }

        if (teamStudentNames.size) {
          teams.push({ code: teamCode, name: teamName, students: [] });
        }
      }

      if (!teams.some(({ code }) => [...assignments.values()].some((teamCodes) => teamCodes.has(code))) || !criteria?.length) {
        throw new BadRequestException(
          'No team rosters or signed point criteria were found. Use the supplied team-tracking workbook format.',
        );
      }
      for (const student of allStudents.values()) {
        teams.find(({ code }) => code === student.teamCode)?.students.push(student);
      }
      const studentCount = allStudents.size;
      if (studentCount > MAX_STUDENTS) {
        throw new BadRequestException(
          `The workbook contains ${studentCount} students; the import limit is ${MAX_STUDENTS}.`,
        );
      }
      return {
        teams,
        students: [...allStudents.values()],
        criteria,
        ambiguousTeamAssignmentCount: [...assignments.values()].filter((teamCodes) => teamCodes.size > 1).length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        'Failed to parse uploaded workbook',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException(
        'Could not read the Excel workbook. Ensure it is a valid, unencrypted .xlsx file.',
      );
    }
  }

  private parseCriteria(worksheet: ExcelJS.Worksheet): ImportedCriterion[] {
    const headers: ImportedCriterion[] = [];
    const seenCodes = new Set<string>();
    const headerRow = worksheet.getRow(1);
    for (let column = 4; column <= headerRow.cellCount; column += 1) {
      const header = this.cellText(headerRow.getCell(column), worksheet.name, 1);
      if (!header) continue;
      const pointMatch = header.match(/\(([+\-−])\s*(\d+(?:[.,]\d{1,2})?)\)/u);
      if (!pointMatch) continue;
      const name = header.replace(/\s*\([+\-−]\s*\d+(?:[.,]\d{1,2})?\)\s*/u, '').trim();
      const amount = Number(pointMatch[2].replace(',', '.'));
      if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
        throw new BadRequestException(`Sheet "${worksheet.name}", row 1: invalid criterion "${header}".`);
      }
      const baseCode = this.toCriterionCode(name).slice(0, 40);
      let code = baseCode;
      let suffix = 2;
      while (seenCodes.has(code)) {
        const tail = `_${suffix++}`;
        code = `${baseCode.slice(0, 40 - tail.length)}${tail}`;
      }
      seenCodes.add(code);
      headers.push({
        code,
        name,
        type: pointMatch[1] === '+' ? CriterionType.BONUS : CriterionType.PENALTY,
        defaultPoint: amount,
        sortOrder: headers.length + 1,
      });
    }
    if (!headers.length) {
      throw new BadRequestException(`Sheet "${worksheet.name}" has no point criteria in row 1.`);
    }
    return headers;
  }

  private sameCriteria(left: ImportedCriterion[], right: ImportedCriterion[]): boolean {
    return (
      left.length === right.length &&
      left.every((criterion, index) => {
        const other = right[index];
        return (
          criterion.code === other.code &&
          criterion.name === other.name &&
          criterion.type === other.type &&
          criterion.defaultPoint === other.defaultPoint
        );
      })
    );
  }

  private cellText(cell: ExcelJS.Cell, sheetName: string, rowNumber: number): string {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    throw new BadRequestException(
      `Sheet "${sheetName}", row ${rowNumber}: formulas and rich-text cells are not supported in names or headers.`,
    );
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase('vi')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private toCriterionCode(value: string): string {
    const code = value
      .normalize('NFKD')
      .replace(/đ/gi, 'd')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return code || 'CRITERION';
  }

  private async prepareNewStudents(students: ImportedStudent[]): Promise<PreparedStudent[]> {
    const prepared = students.map((student) => ({
      ...student,
      userId: randomUUID(),
      profileId: randomUUID(),
      enrollmentId: randomUUID(),
      membershipId: randomUUID(),
      username: `imp${randomUUID().replace(/-/g, '')}`.slice(0, 50),
      email: `imp-${randomUUID()}@student.classpoint.invalid`,
      password: randomBytes(24).toString('base64url'),
      passwordHash: '',
    }));
    const concurrency = 4;
    for (let index = 0; index < prepared.length; index += concurrency) {
      await Promise.all(
        prepared.slice(index, index + concurrency).map(async (student) => {
          student.passwordHash = await this.passwords.hash(student.password);
        }),
      );
    }
    return prepared;
  }
}
