import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, Prisma } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWeekDto } from './dto/create-week.dto';

const weekSelect = {
  id: true,
  classroomId: true,
  name: true,
  startDate: true,
  endDate: true,
  isClosed: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WeeksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
  ) {}

  async findByClassroom(classroomId: string, userId: string) {
    await this.access.requireRole(userId, classroomId, [
      ClassRole.HOMEROOM_TEACHER,
      ClassRole.TEAM_LEADER,
      ClassRole.STUDENT,
    ]);
    return this.prisma.competitionWeek.findMany({
      where: { classroomId },
      select: weekSelect,
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const week = await this.prisma.competitionWeek.findFirst({
      where: { id, classroom: { isActive: true } },
      select: weekSelect,
    });
    if (!week) {
      throw new NotFoundException('Competition week not found');
    }
    await this.access.requireRole(userId, week.classroomId, [
      ClassRole.HOMEROOM_TEACHER,
      ClassRole.TEAM_LEADER,
      ClassRole.STUDENT,
    ]);
    return week;
  }

  async create(classroomId: string, dto: CreateWeekDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    const startDate = this.toDate(dto.startDate);
    const endDate = this.toDate(dto.endDate);
    if (
      startDate.getUTCDay() !== 1 ||
      endDate.getTime() - startDate.getTime() !== 6 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException('Competition weeks must run Monday through Sunday');
    }

    const overlappingWeek = await this.prisma.competitionWeek.findFirst({
      where: {
        classroomId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (overlappingWeek) {
      throw new ConflictException('Competition week overlaps an existing week');
    }

    try {
      return await this.prisma.competitionWeek.create({
        data: { classroomId, name: dto.name.trim(), startDate, endDate },
        select: weekSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error);
    }
  }

  async close(id: string, userId: string) {
    return this.setClosed(id, userId, true);
  }

  async reopen(id: string, userId: string) {
    return this.setClosed(id, userId, false);
  }

  private async setClosed(id: string, userId: string, isClosed: boolean) {
    const week = await this.prisma.competitionWeek.findUnique({
      where: { id },
      select: { id: true, classroomId: true, isClosed: true, endDate: true },
    });
    if (!week) {
      throw new NotFoundException('Competition week not found');
    }
    await this.access.requireRole(userId, week.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    if (!isClosed && week.endDate < this.currentUtcDate()) {
      throw new ConflictException('Past competition weeks cannot be reopened');
    }
    if (week.isClosed === isClosed) {
      return this.prisma.competitionWeek.findUniqueOrThrow({
        where: { id },
        select: weekSelect,
      });
    }
    return this.prisma.competitionWeek.update({
      where: { id },
      data: { isClosed },
      select: weekSelect,
    });
  }

  private toDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Week dates must be valid calendar dates');
    }
    return date;
  }

  private currentUtcDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private throwIfConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2004')
    ) {
      throw new ConflictException('Competition week overlaps an existing week');
    }
    throw error;
  }
}
