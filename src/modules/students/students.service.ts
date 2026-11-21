import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PasswordService } from '../../common/services/password.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

const publicStudentSelect = {
  id: true,
  studentCode: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
  phone: true,
  address: true,
} as const;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
    private readonly passwords: PasswordService,
  ) {}

  async findByClassroom(classroomId: string, userId: string) {
    const membership = await this.prisma.classMembership.findFirst({
      where: { userId, classroomId, isActive: true, classroom: { isActive: true } },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this classroom');
    }

    let enrollmentIds: string[] | undefined;
    if (membership.role === ClassRole.STUDENT) {
      const enrollment = await this.prisma.classStudent.findFirst({
        where: {
          classroomId,
          isActive: true,
          student: { userId },
        },
        select: { id: true },
      });
      enrollmentIds = enrollment ? [enrollment.id] : [];
    } else if (membership.role === ClassRole.TEAM_LEADER) {
      const leaderMembership = await this.prisma.teamMembership.findFirst({
        where: {
          isLeader: true,
          leftAt: null,
          classStudent: { classroomId, isActive: true, student: { userId } },
        },
        select: { teamId: true },
      });
      const teamMembers = leaderMembership
        ? await this.prisma.teamMembership.findMany({
            where: { teamId: leaderMembership.teamId, leftAt: null, classStudent: { isActive: true } },
            select: { classStudentId: true },
          })
        : [];
      enrollmentIds = teamMembers.map(({ classStudentId }) => classStudentId);
    }

    const students = await this.prisma.classStudent.findMany({
      where: {
        classroomId,
        isActive: true,
        classroom: { isActive: true },
        ...(enrollmentIds !== undefined && { id: { in: enrollmentIds } }),
      },
      select: {
        id: true,
        joinedAt: true,
        student: { select: publicStudentSelect },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return students;
  }

  async create(classroomId: string, dto: CreateStudentDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const classroom = await transaction.classroom.findFirst({
          where: { id: classroomId, isActive: true },
          select: { id: true },
        });
        if (!classroom) {
          throw new NotFoundException('Classroom not found');
        }

        const fullName = dto.fullName.trim();
        const account = await transaction.user.create({
          data: {
            username: dto.username.trim().toLowerCase(),
            email: dto.email.trim().toLowerCase(),
            passwordHash: await this.passwords.hash(dto.password),
            fullName,
          },
          select: { id: true },
        });
        const student = await transaction.student.create({
          data: {
            userId: account.id,
            studentCode: dto.studentCode.trim(),
            fullName,
            ...(dto.dateOfBirth !== undefined && {
              dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00.000Z`),
            }),
            ...(dto.gender !== undefined && { gender: dto.gender.trim() || null }),
            ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
            ...(dto.address !== undefined && { address: dto.address.trim() || null }),
          },
          select: publicStudentSelect,
        });
        const classStudent = await transaction.classStudent.create({
          data: { studentId: student.id, classroomId },
          select: { id: true, joinedAt: true },
        });
        await transaction.classMembership.create({
          data: {
            userId: account.id,
            classroomId,
            role: ClassRole.STUDENT,
          },
        });
        return { ...classStudent, student };
      });
    } catch (error) {
      this.throwIfUniqueConstraint(error);
    }
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select: {
        ...publicStudentSelect,
        userId: true,
        user: { select: { id: true, username: true } },
        classRecords: {
          where: { isActive: true, classroom: { isActive: true } },
          select: {
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
    if (student.userId !== user.id) {
      const classroomIds = student.classRecords.map(({ classroomId }) => classroomId);
      const memberships = await this.prisma.classMembership.findMany({
        where: {
          userId: user.id,
          classroomId: { in: classroomIds },
          isActive: true,
          classroom: { isActive: true },
        },
        select: { classroomId: true, role: true },
      });
      if (memberships.some(({ role }) => role === ClassRole.HOMEROOM_TEACHER)) {
        return this.toPublicProfile(student);
      }

      const leaderClassroomIds = memberships
        .filter(({ role }) => role === ClassRole.TEAM_LEADER)
        .map(({ classroomId }) => classroomId);
      const leaderTeams = await this.prisma.teamMembership.findMany({
        where: {
          isLeader: true,
          leftAt: null,
          classStudent: {
            classroomId: { in: leaderClassroomIds },
            isActive: true,
            student: { userId: user.id },
          },
        },
        select: { teamId: true },
      });
      const canView = leaderTeams.length > 0 && student.classRecords.some(({ teamHistory }) =>
        teamHistory.some(
          ({ teamId }) => leaderTeams.some((leaderTeam) => leaderTeam.teamId === teamId),
        ),
      );
      if (!canView) {
        throw new ForbiddenException('You may only view your own profile or your team members');
      }
    }
    return this.toPublicProfile(student);
  }

  async update(id: string, dto: UpdateStudentDto, userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select: {
        userId: true,
        classRecords: {
          where: { isActive: true, classroom: { isActive: true } },
          select: { classroomId: true },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    await this.access.requireAnyRole(
      userId,
      student.classRecords.map(({ classroomId }) => classroomId),
      [ClassRole.HOMEROOM_TEACHER],
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.student.update({
          where: { id },
          data: {
            ...(dto.studentCode !== undefined && { studentCode: dto.studentCode.trim() }),
            ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
            ...(dto.dateOfBirth !== undefined && {
              dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00.000Z`),
            }),
            ...(dto.gender !== undefined && { gender: dto.gender.trim() || null }),
            ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
            ...(dto.address !== undefined && { address: dto.address.trim() || null }),
          },
          select: publicStudentSelect,
        });
        if (dto.fullName !== undefined) {
          await transaction.user.update({
            where: { id: student.userId },
            data: { fullName: dto.fullName.trim() },
          });
        }
        return updated;
      });
    } catch (error) {
      this.throwIfUniqueConstraint(error);
    }
  }

  private throwIfUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Student code or account username/email already exists');
    }
    throw error;
  }

  private toPublicProfile(student: {
    userId: string;
    classRecords: Array<{ classroomId: string; teamHistory: Array<{ teamId: string }> }>;
    user: { id: string; username: string };
    id: string;
    studentCode: string;
    fullName: string;
    dateOfBirth: Date | null;
    gender: string | null;
    phone: string | null;
    address: string | null;
  }) {
    const { userId: _userId, classRecords, ...publicProfile } = student;
    return {
      ...publicProfile,
      classrooms: classRecords.map(({ classroomId }) => classroomId),
    };
  }
}
