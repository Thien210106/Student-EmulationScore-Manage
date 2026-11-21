import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamLeaderDto } from './dto/team-leader.dto';
import { TeamMemberDto } from './dto/team-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

const publicTeamSelect = {
  id: true,
  name: true,
  code: true,
  classroomId: true,
} as const;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
  ) {}

  async findByClassroom(classroomId: string, userId: string) {
    const membership = await this.prisma.classMembership.findFirst({
      where: { userId, classroomId, isActive: true, classroom: { isActive: true } },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException('Classroom not found');
    }

    let visibleTeamIds: string[] | undefined;
    if (membership.role !== ClassRole.HOMEROOM_TEACHER) {
      const enrollment = await this.prisma.classStudent.findFirst({
        where: { classroomId, isActive: true, student: { userId } },
        select: { id: true },
      });
      const teamMembership = enrollment
        ? await this.prisma.teamMembership.findFirst({
            where: { classStudentId: enrollment.id, leftAt: null },
            select: { teamId: true },
          })
        : null;
      visibleTeamIds = teamMembership ? [teamMembership.teamId] : [];
    }

    return this.prisma.team.findMany({
      where: {
        classroomId,
        classroom: { isActive: true },
        ...(visibleTeamIds !== undefined && { id: { in: visibleTeamIds } }),
      },
      select: {
        ...publicTeamSelect,
        memberships: {
          where: { leftAt: null, classStudent: { isActive: true } },
          select: {
            id: true,
            joinedAt: true,
            isLeader: true,
            classStudent: {
              select: {
                id: true,
                student: { select: { id: true, studentCode: true, fullName: true } },
              },
            },
          },
          orderBy: { classStudent: { student: { fullName: 'asc' } } },
        },
        leaderHistory: {
          where: { endedAt: null },
          select: {
            id: true,
            startedAt: true,
            classStudent: {
              select: { student: { select: { id: true, studentCode: true, fullName: true } } },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(classroomId: string, dto: CreateTeamDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    try {
      return await this.prisma.team.create({
        data: {
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          classroomId,
        },
        select: publicTeamSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error, 'Team code already exists in this classroom');
    }
  }

  async update(id: string, dto: UpdateTeamDto, userId: string) {
    const team = await this.findTeam(id);
    await this.access.requireRole(userId, team.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    try {
      return await this.prisma.team.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        },
        select: publicTeamSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error, `Team code already exists in classroom ${team.classroomId}`);
    }
  }

  async addMember(teamId: string, dto: TeamMemberDto, userId: string) {
    const team = await this.findTeam(teamId);
    await this.access.requireRole(userId, team.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const enrollment = await transaction.classStudent.findFirst({
          where: {
            id: dto.classStudentId,
            classroomId: team.classroomId,
            isActive: true,
            classroom: { isActive: true },
          },
          select: { id: true },
        });
        if (!enrollment) {
          throw new NotFoundException('Active student enrollment not found in this team classroom');
        }

        const currentMembership = await transaction.teamMembership.findFirst({
          where: { classStudentId: enrollment.id, leftAt: null },
          select: { id: true, teamId: true },
        });
        if (currentMembership) {
          throw new ConflictException(
            currentMembership.teamId === teamId
              ? 'Student is already a member of this team'
              : 'Student already belongs to another active team',
          );
        }

        return transaction.teamMembership.create({
          data: { teamId, classStudentId: enrollment.id },
          select: {
            id: true,
            teamId: true,
            classStudentId: true,
            joinedAt: true,
            leftAt: true,
            isLeader: true,
          },
        });
      });
    } catch (error) {
      this.throwIfConstraint(error, 'Student already has an overlapping active team membership');
    }
  }

  async removeMember(
    teamId: string,
    memberId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const team = await this.findTeam(teamId);
    await this.access.requireRole(userId, team.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    await this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.teamMembership.findFirst({
        where: { id: memberId, teamId, leftAt: null },
        select: {
          id: true,
          classStudentId: true,
          joinedAt: true,
          classStudent: { select: { classroomId: true, student: { select: { userId: true } } } },
        },
      });
      if (!membership) {
        throw new NotFoundException('Active team membership not found');
      }

      const currentLeadership = await transaction.teamLeaderHistory.findFirst({
        where: { teamId, classStudentId: membership.classStudentId, endedAt: null },
        select: { id: true, startedAt: true },
      });
      const endedAt = this.after(membership.joinedAt, currentLeadership?.startedAt);
      if (currentLeadership) {
        await transaction.teamLeaderHistory.update({
          where: { id: currentLeadership.id },
          data: { endedAt },
        });
      }
      await transaction.classMembership.updateMany({
        where: {
          userId: membership.classStudent.student.userId,
          classroomId: membership.classStudent.classroomId,
          role: ClassRole.TEAM_LEADER,
          isActive: true,
        },
        data: { role: ClassRole.STUDENT },
      });
      await transaction.teamMembership.update({
        where: { id: membership.id },
        data: { leftAt: endedAt, isLeader: false },
      });
    });
    return { success: true };
  }

  async setLeader(teamId: string, dto: TeamLeaderDto, userId: string) {
    const team = await this.findTeam(teamId);
    await this.access.requireRole(userId, team.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const candidate = await transaction.teamMembership.findFirst({
          where: {
            teamId,
            classStudentId: dto.classStudentId,
            leftAt: null,
            team: { classroom: { isActive: true } },
          },
          select: {
            id: true,
            classStudentId: true,
            joinedAt: true,
            isLeader: true,
            classStudent: { select: { classroomId: true, student: { select: { userId: true } } } },
          },
        });
        if (!candidate) {
          throw new NotFoundException('The new leader must be an active member of this team');
        }

        const currentLeader = await transaction.teamLeaderHistory.findFirst({
          where: { teamId, endedAt: null },
          select: {
            id: true,
            classStudentId: true,
            startedAt: true,
            classStudent: { select: { student: { select: { userId: true } } } },
          },
        });
        if (currentLeader?.classStudentId === candidate.classStudentId) {
          return {
            teamId,
            classStudentId: candidate.classStudentId,
            startedAt: currentLeader.startedAt,
          };
        }

        const startedAt = this.after(candidate.joinedAt, currentLeader?.startedAt);
        if (currentLeader) {
          await transaction.teamLeaderHistory.update({
            where: { id: currentLeader.id },
            data: { endedAt: startedAt },
          });
          await transaction.teamMembership.updateMany({
            where: {
              teamId,
              classStudentId: currentLeader.classStudentId,
              leftAt: null,
              isLeader: true,
            },
            data: { isLeader: false },
          });
          await transaction.classMembership.updateMany({
            where: {
              userId: currentLeader.classStudent.student.userId,
              classroomId: team.classroomId,
              role: ClassRole.TEAM_LEADER,
              isActive: true,
            },
            data: { role: ClassRole.STUDENT },
          });
        }

        const roleUpdate = await transaction.classMembership.updateMany({
          where: {
            userId: candidate.classStudent.student.userId,
            classroomId: candidate.classStudent.classroomId,
            role: { in: [ClassRole.STUDENT, ClassRole.TEAM_LEADER] },
            isActive: true,
          },
          data: { role: ClassRole.TEAM_LEADER },
        });
        if (roleUpdate.count !== 1) {
          throw new ConflictException(
            'Only an active student account can be assigned as the team leader',
          );
        }

        await transaction.teamMembership.update({
          where: { id: candidate.id },
          data: { isLeader: true },
        });
        return transaction.teamLeaderHistory.create({
          data: {
            teamId,
            classStudentId: candidate.classStudentId,
            startedAt,
          },
          select: {
            id: true,
            teamId: true,
            classStudentId: true,
            startedAt: true,
            endedAt: true,
          },
        });
      });
    } catch (error) {
      this.throwIfConstraint(error, 'A conflicting team leader or membership already exists');
    }
  }

  private async findTeam(id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, classroom: { isActive: true } },
      select: { id: true, classroomId: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  private after(date: Date, otherDate?: Date): Date {
    return new Date(
      Math.max(
        Date.now(),
        date.getTime() + 1,
        otherDate ? otherDate.getTime() + 1 : 0,
      ),
    );
  }

  private throwIfConstraint(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004', 'P2025', 'P2034'].includes(error.code)
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
