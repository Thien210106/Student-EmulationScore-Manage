import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassRole,
  PointStatus,
  PointType,
  Prisma,
  RankingMode,
} from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdjustPointDto } from './dto/adjust-point.dto';
import { CreatePointDto } from './dto/create-point.dto';

const pointSelect = {
  id: true,
  classStudentId: true,
  criterionId: true,
  weekId: true,
  classroomId: true,
  createdById: true,
  type: true,
  point: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  criterion: { select: { code: true, name: true } },
  week: { select: { name: true, startDate: true, endDate: true } },
  classStudent: {
    select: { student: { select: { id: true, studentCode: true, fullName: true } } },
  },
  adjustments: {
    select: {
      id: true,
      oldPoint: true,
      newPoint: true,
      reason: true,
      createdAt: true,
      adjustedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

export interface TeamScore {
  teamId: string;
  teamName: string;
  teamCode: string;
  memberCount: number;
  score: Prisma.Decimal;
  rank: number;
}

@Injectable()
export class PointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
  ) {}

  async findByClassroom(classroomId: string, weekId: string | undefined, userId: string) {
    const membership = await this.prisma.classMembership.findFirst({
      where: { userId, classroomId, isActive: true, classroom: { isActive: true } },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException('Classroom not found');
    }

    let enrollmentIds: string[] | undefined;
    if (membership.role !== ClassRole.HOMEROOM_TEACHER) {
      const enrollment = await this.prisma.classStudent.findFirst({
        where: { classroomId, isActive: true, student: { userId } },
        select: { id: true },
      });
      if (membership.role === ClassRole.STUDENT) {
        enrollmentIds = enrollment ? [enrollment.id] : [];
      } else {
        const teamMemberships = enrollment
          ? await this.prisma.teamMembership.findMany({
              where: {
                classStudentId: enrollment.id,
                leftAt: null,
                isLeader: true,
                classStudent: { isActive: true },
              },
              select: { teamId: true },
            })
          : [];
        const teamMembers = teamMemberships.length
          ? await this.prisma.teamMembership.findMany({
              where: {
                teamId: { in: teamMemberships.map(({ teamId }) => teamId) },
                leftAt: null,
                classStudent: { isActive: true },
              },
              select: { classStudentId: true },
            })
          : [];
        enrollmentIds = teamMembers.map(({ classStudentId }) => classStudentId);
      }
    }

    return this.prisma.pointRecord.findMany({
      where: {
        classroomId,
        ...(weekId && { weekId }),
        ...(enrollmentIds !== undefined && { classStudentId: { in: enrollmentIds } }),
      },
      select: pointSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(classroomId: string, dto: CreatePointDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    const [enrollment, criterion, week] = await Promise.all([
      this.prisma.classStudent.findFirst({
        where: {
          id: dto.classStudentId,
          classroomId,
          isActive: true,
          classroom: { isActive: true },
        },
        select: { id: true },
      }),
      this.prisma.criterion.findFirst({
        where: { id: dto.criterionId, classroomId, isActive: true },
        select: {
          id: true,
          type: true,
          defaultPoint: true,
          minPoint: true,
          maxPoint: true,
        },
      }),
      this.prisma.competitionWeek.findFirst({
        where: { id: dto.weekId, classroomId, classroom: { isActive: true } },
        select: { id: true, isClosed: true, endDate: true },
      }),
    ]);
    if (!enrollment) {
      throw new NotFoundException('Active student enrollment not found in this classroom');
    }
    if (!criterion) {
      throw new NotFoundException('Active criterion not found in this classroom');
    }
    if (!week) {
      throw new NotFoundException('Competition week not found in this classroom');
    }
    if (this.isWeekLocked(week)) {
      throw new ConflictException('Points cannot be added to a closed or past competition week');
    }

    const point = criterion.defaultPoint.toNumber();
    this.validateCriterionPoint(point, criterion.minPoint?.toNumber(), criterion.maxPoint?.toNumber());

    try {
      return await this.prisma.pointRecord.create({
        data: {
          classStudentId: enrollment.id,
          criterionId: criterion.id,
          weekId: week.id,
          classroomId,
          createdById: userId,
          type: criterion.type,
          point,
          description: dto.description?.trim() || null,
        },
        select: pointSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error, 'Point record conflicts with classroom scoring rules');
    }
  }

  async findOne(id: string, userId: string) {
    const record = await this.prisma.pointRecord.findUnique({
      where: { id },
      select: {
        ...pointSelect,
        classStudent: {
          select: {
            classroomId: true,
            student: {
              select: {
                id: true,
                userId: true,
                studentCode: true,
                fullName: true,
              },
            },
            teamHistory: {
              where: { leftAt: null },
              select: { teamId: true },
            },
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Point record not found');
    }

    const membership = await this.prisma.classMembership.findFirst({
      where: {
        userId,
        classroomId: record.classroomId,
        isActive: true,
        classroom: { isActive: true },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException('Point record not found');
    }
    if (membership.role === ClassRole.STUDENT) {
      if (record.classStudent.student.userId !== userId) {
        throw new NotFoundException('Point record not found');
      }
    } else if (membership.role === ClassRole.TEAM_LEADER) {
      const leaderTeams = await this.prisma.teamMembership.findMany({
        where: {
          leftAt: null,
          isLeader: true,
          classStudent: { classroomId: record.classroomId, student: { userId } },
        },
        select: { teamId: true },
      });
      if (
        !record.classStudent.teamHistory.some(({ teamId }) =>
          leaderTeams.some((leaderTeam) => leaderTeam.teamId === teamId),
        )
      ) {
        throw new NotFoundException('Point record not found');
      }
    }
    const { userId: _studentUserId, ...publicStudent } = record.classStudent.student;
    return {
      ...record,
      classStudent: {
        ...record.classStudent,
        student: publicStudent,
      },
    };
  }

  async findStudentHistory(studentId: string, userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        userId: true,
        classRecords: {
          select: {
            id: true,
            classroomId: true,
            teamHistory: {
              where: { leftAt: null },
              select: { teamId: true },
            },
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.userId === userId) {
      return this.prisma.pointRecord.findMany({
        where: {
          classStudentId: { in: student.classRecords.map(({ id }) => id) },
        },
        select: pointSelect,
        orderBy: { createdAt: 'desc' },
      });
    }

    const classroomIds = student.classRecords.map(({ classroomId }) => classroomId);
    const memberships = await this.prisma.classMembership.findMany({
      where: {
        userId,
        classroomId: { in: classroomIds },
        isActive: true,
        classroom: { isActive: true },
      },
      select: { classroomId: true, role: true },
    });
    const teacherClassroomIds = memberships
      .filter(({ role }) => role === ClassRole.HOMEROOM_TEACHER)
      .map(({ classroomId }) => classroomId);
    const leaderClassroomIds = memberships
      .filter(({ role }) => role === ClassRole.TEAM_LEADER)
      .map(({ classroomId }) => classroomId);
    const leaderMemberships = leaderClassroomIds.length
      ? await this.prisma.teamMembership.findMany({
          where: {
            leftAt: null,
            isLeader: true,
            classStudent: {
              classroomId: { in: leaderClassroomIds },
              student: { userId },
            },
          },
          select: { teamId: true },
        })
      : [];
    const leaderTeamIds = leaderMemberships.map(({ teamId }) => teamId);
    const visibleEnrollmentIds = student.classRecords
      .filter(
        (record) =>
          teacherClassroomIds.includes(record.classroomId) ||
          record.teamHistory.some(({ teamId }) => leaderTeamIds.includes(teamId)),
      )
      .map(({ id }) => id);
    if (visibleEnrollmentIds.length === 0) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.pointRecord.findMany({
      where: { classStudentId: { in: visibleEnrollmentIds } },
      select: pointSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAdjustments(id: string, userId: string) {
    const record = await this.findOne(id, userId);
    return record.adjustments;
  }

  async void(id: string, userId: string) {
    const record = await this.prisma.pointRecord.findUnique({
      where: { id },
      select: {
        id: true,
        classroomId: true,
        status: true,
        week: { select: { isClosed: true, endDate: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('Point record not found');
    }
    await this.access.requireRole(userId, record.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    if (record.status !== PointStatus.ACTIVE) {
      throw new ConflictException('Point record is already voided');
    }
    if (this.isWeekLocked(record.week)) {
      throw new ConflictException('Points in a closed or past competition week cannot be voided');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.pointRecord.updateMany({
          where: {
            id,
            status: PointStatus.ACTIVE,
            week: {
              is: {
                isClosed: false,
                endDate: { gte: this.currentUtcDate() },
              },
            },
          },
          data: { status: PointStatus.VOIDED },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Point record changed or its week was closed or has passed');
        }
        return transaction.pointRecord.findUniqueOrThrow({
          where: { id },
          select: pointSelect,
        });
      });
    } catch (error) {
      this.throwIfConstraint(error, 'Point record changed or its week was closed');
    }
  }

  async adjust(id: string, dto: AdjustPointDto, userId: string) {
    const record = await this.prisma.pointRecord.findUnique({
      where: { id },
      select: {
        id: true,
        classroomId: true,
        point: true,
        status: true,
        week: { select: { isClosed: true, endDate: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('Point record not found');
    }
    await this.access.requireRole(userId, record.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    if (record.status !== PointStatus.ACTIVE) {
      throw new ConflictException('Voided point records cannot be adjusted');
    }
    if (this.isWeekLocked(record.week)) {
      throw new ConflictException('Points in a closed or past competition week cannot be adjusted');
    }
    throw new ConflictException('Point values are fixed by their criterion and cannot be adjusted');
  }

  async teamRankings(classroomId: string, weekId: string, userId: string) {
    const week = await this.prisma.competitionWeek.findFirst({
      where: { id: weekId, classroomId, classroom: { isActive: true } },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        classroom: { select: { rankingMode: true } },
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
    const visibleTeamIds =
      membership.role === ClassRole.HOMEROOM_TEACHER
        ? undefined
        : await this.currentTeamIds(classroomId, userId, membership.role);

    const start = new Date(`${week.startDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const endExclusive = new Date(
      `${week.endDate.toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const [teams, pointRecords] = await Promise.all([
      this.prisma.team.findMany({
        where: {
          classroomId,
          ...(visibleTeamIds !== undefined && { id: { in: visibleTeamIds } }),
          memberships: {
            some: {
              joinedAt: { lt: endExclusive },
              OR: [{ leftAt: null }, { leftAt: { gt: start } }],
            },
          },
        },
        select: {
          id: true,
          name: true,
          code: true,
          memberships: {
            where: {
              joinedAt: { lt: endExclusive },
              OR: [{ leftAt: null }, { leftAt: { gt: start } }],
            },
            select: { classStudentId: true, joinedAt: true, leftAt: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.pointRecord.findMany({
        where: {
          classroomId,
          weekId,
          status: PointStatus.ACTIVE,
          createdAt: { gte: start, lt: endExclusive },
        },
        select: { classStudentId: true, point: true, type: true, createdAt: true },
      }),
    ]);

    const scores: TeamScore[] = teams.map((team) => {
      const memberIds = new Set(team.memberships.map(({ classStudentId }) => classStudentId));
      const total = pointRecords.reduce((sum, record) => {
        const belongedToTeamAtEntry = team.memberships.some(
          (entry) =>
            entry.classStudentId === record.classStudentId &&
            entry.joinedAt <= record.createdAt &&
            (entry.leftAt === null || entry.leftAt > record.createdAt),
        );
        if (!belongedToTeamAtEntry) {
          return sum;
        }
        return record.type === PointType.BONUS
          ? sum.plus(record.point)
          : sum.minus(record.point);
      }, new Prisma.Decimal(0));
      const score =
        week.classroom.rankingMode === RankingMode.AVERAGE_SCORE && memberIds.size > 0
          ? total.dividedBy(memberIds.size)
          : total;
      return {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        memberCount: memberIds.size,
        score,
        rank: 0,
      };
    });

    scores.sort((left, right) => right.score.comparedTo(left.score));
    let previousScore: Prisma.Decimal | undefined;
    let rank = 0;
    for (let index = 0; index < scores.length; index += 1) {
      const current = scores[index];
      if (!previousScore || !current.score.equals(previousScore)) {
        rank = index + 1;
      }
      current.rank = rank;
      previousScore = current.score;
    }
    return {
      week: { id: week.id, name: week.name, startDate: week.startDate, endDate: week.endDate },
      rankingMode: week.classroom.rankingMode,
      rankings: scores,
    };
  }

  private async currentTeamIds(
    classroomId: string,
    userId: string,
    role: ClassRole,
  ): Promise<string[]> {
    const enrollment = await this.prisma.classStudent.findFirst({
      where: { classroomId, isActive: true, student: { userId } },
      select: { id: true },
    });
    if (!enrollment) {
      return [];
    }
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        classStudentId: enrollment.id,
        leftAt: null,
        classStudent: { isActive: true },
        ...(role === ClassRole.TEAM_LEADER && { isLeader: true }),
      },
      select: { teamId: true },
    });
    return memberships.map(({ teamId }) => teamId);
  }

  private validateCriterionPoint(
    point: number,
    minPoint: number | undefined,
    maxPoint: number | undefined,
  ): void {
    if (
      (minPoint !== undefined && point < minPoint) ||
      (maxPoint !== undefined && point > maxPoint)
    ) {
      throw new ConflictException('Point value is outside the criterion bounds');
    }
  }

  private isWeekLocked(week: { isClosed: boolean; endDate: Date }): boolean {
    return week.isClosed || week.endDate < this.currentUtcDate();
  }

  private currentUtcDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private throwIfConstraint(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004', 'P2025'].includes(error.code)
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
