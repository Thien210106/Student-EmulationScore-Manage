import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassRole,
  ClassificationStatus,
  PointStatus,
  PointType,
  Prisma,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';

export interface StudentWeeklyResult {
  rank: number;
  classStudentId: string;
  studentCode: string;
  fullName: string;
  bonusPoints: Prisma.Decimal;
  penaltyPoints: Prisma.Decimal;
  netScore: Prisma.Decimal;
  classification: string | null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async weeklyStudents(classroomId: string, weekId: string, userId: string) {
    const week = await this.prisma.competitionWeek.findFirst({
      where: { id: weekId, classroomId, classroom: { isActive: true } },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        classroom: {
          select: { name: true, code: true },
        },
      },
    });
    if (!week) {
      throw new NotFoundException('Competition week not found in this classroom');
    }

    const membership = await this.prisma.classMembership.findFirst({
      where: { userId, classroomId, isActive: true, classroom: { isActive: true } },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException('Classroom not found');
    }

    const weekStart = this.dayStart(week.startDate);
    const weekEndExclusive = this.dayAfter(week.endDate);
    let visibleEnrollmentIds: string[] | undefined;
    if (membership.role === ClassRole.STUDENT) {
      const enrollment = await this.prisma.classStudent.findFirst({
        where: {
          classroomId,
          joinedAt: { lt: weekEndExclusive },
          student: { userId },
        },
        select: { id: true },
      });
      visibleEnrollmentIds = enrollment ? [enrollment.id] : [];
    } else if (membership.role === ClassRole.TEAM_LEADER) {
      const leaderEnrollment = await this.prisma.classStudent.findFirst({
        where: { classroomId, isActive: true, student: { userId } },
        select: { id: true },
      });
      const leaderTeams = leaderEnrollment
        ? await this.prisma.teamMembership.findMany({
            where: {
              classStudentId: leaderEnrollment.id,
              leftAt: null,
              isLeader: true,
            },
            select: { teamId: true },
          })
        : [];
      const teamMembers = leaderTeams.length
        ? await this.prisma.teamMembership.findMany({
            where: {
              teamId: { in: leaderTeams.map(({ teamId }) => teamId) },
              joinedAt: { lt: weekEndExclusive },
              OR: [{ leftAt: null }, { leftAt: { gt: weekStart } }],
            },
            select: { classStudentId: true },
          })
        : [];
      visibleEnrollmentIds = [
        ...new Set(teamMembers.map(({ classStudentId }) => classStudentId)),
      ];
    }

    const [enrollments, pointRecords, classificationRules] = await Promise.all([
      this.prisma.classStudent.findMany({
        where: {
          classroomId,
          joinedAt: { lt: weekEndExclusive },
        },
        select: {
          id: true,
          student: { select: { studentCode: true, fullName: true } },
        },
        orderBy: { student: { fullName: 'asc' } },
      }),
      this.prisma.pointRecord.findMany({
        where: {
          classroomId,
          weekId,
          status: PointStatus.ACTIVE,
        },
        select: { classStudentId: true, point: true, type: true },
      }),
      this.prisma.classificationRule.findMany({
        where: { classroomId, status: ClassificationStatus.ACTIVE },
        select: { name: true, minScore: true, maxScore: true },
        orderBy: { minScore: 'desc' },
      }),
    ]);

    const totals = new Map<
      string,
      { bonus: Prisma.Decimal; penalty: Prisma.Decimal }
    >();
    for (const record of pointRecords) {
      const total = totals.get(record.classStudentId) ?? {
        bonus: new Prisma.Decimal(0),
        penalty: new Prisma.Decimal(0),
      };
      if (record.type === PointType.BONUS) {
        total.bonus = total.bonus.plus(record.point);
      } else {
        total.penalty = total.penalty.plus(record.point);
      }
      totals.set(record.classStudentId, total);
    }

    const results: StudentWeeklyResult[] = enrollments.map((enrollment) => {
      const total = totals.get(enrollment.id) ?? {
        bonus: new Prisma.Decimal(0),
        penalty: new Prisma.Decimal(0),
      };
      const netScore = total.bonus.minus(total.penalty);
      const classification =
        classificationRules.find(
          (rule) =>
            netScore.greaterThanOrEqualTo(rule.minScore) &&
            (rule.maxScore === null || netScore.lessThan(rule.maxScore)),
        )?.name ?? null;
      return {
        rank: 0,
        classStudentId: enrollment.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        bonusPoints: total.bonus,
        penaltyPoints: total.penalty,
        netScore,
        classification,
      };
    });

    results.sort((left, right) => {
      const scoreOrder = right.netScore.comparedTo(left.netScore);
      return scoreOrder || left.fullName.localeCompare(right.fullName);
    });
    let lastScore: Prisma.Decimal | undefined;
    let rank = 0;
    results.forEach((result, index) => {
      if (!lastScore || !result.netScore.equals(lastScore)) {
        rank = index + 1;
      }
      result.rank = rank;
      lastScore = result.netScore;
    });
    const visibleResults =
      visibleEnrollmentIds === undefined
        ? results
        : results.filter((result) => visibleEnrollmentIds.includes(result.classStudentId));

    return {
      classroom: { name: week.classroom.name, code: week.classroom.code },
      week: { id: week.id, name: week.name, startDate: week.startDate, endDate: week.endDate },
      results: visibleResults,
    };
  }

  async exportWeeklyStudents(classroomId: string, weekId: string, userId: string) {
    const report = await this.weeklyStudents(classroomId, weekId, userId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CLASS POINT';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Weekly report');
    sheet.columns = [
      { header: 'Rank', key: 'rank', width: 10 },
      { header: 'Student code', key: 'studentCode', width: 18 },
      { header: 'Student name', key: 'fullName', width: 30 },
      { header: 'Bonus points', key: 'bonusPoints', width: 16 },
      { header: 'Penalty points', key: 'penaltyPoints', width: 16 },
      { header: 'Net score', key: 'netScore', width: 14 },
      { header: 'Classification', key: 'classification', width: 22 },
    ];
    sheet.insertRow(1, ['Weekly student report']);
    sheet.insertRow(2, [`${report.classroom.name} (${report.classroom.code})`]);
    sheet.insertRow(3, [
      `${report.week.name}: ${this.formatDate(report.week.startDate)} - ${this.formatDate(report.week.endDate)}`,
    ]);
    sheet.mergeCells('A1:G1');
    sheet.mergeCells('A2:G2');
    sheet.mergeCells('A3:G3');
    sheet.getRow(1).font = { bold: true, size: 16 };
    sheet.getRow(2).font = { bold: true, size: 12 };
    sheet.getRow(4).font = { bold: true };
    for (const result of report.results) {
      sheet.addRow({
        rank: result.rank,
        studentCode: result.studentCode,
        fullName: result.fullName,
        bonusPoints: result.bonusPoints.toNumber(),
        penaltyPoints: result.penaltyPoints.toNumber(),
        netScore: result.netScore.toNumber(),
        classification: result.classification ?? '',
      });
    }
    sheet.getColumn('bonusPoints').numFmt = '0.00';
    sheet.getColumn('penaltyPoints').numFmt = '0.00';
    sheet.getColumn('netScore').numFmt = '0.00';
    sheet.views = [{ state: 'frozen', ySplit: 4 }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private dayStart(date: Date): Date {
    return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private dayAfter(date: Date): Date {
    const result = this.dayStart(date);
    result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
