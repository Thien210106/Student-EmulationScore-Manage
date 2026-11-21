import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, Prisma, RankingMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';

const classroomSelect = {
  id: true,
  name: true,
  code: true,
  academicYearId: true,
  rankingMode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
} as const;

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const memberships = await this.prisma.classMembership.findMany({
      where: {
        userId,
        isActive: true,
        classroom: { isActive: true },
      },
      select: {
        role: true,
        classroom: { select: classroomSelect },
      },
      orderBy: { classroom: { name: 'asc' } },
    });
    return memberships.map(({ role, classroom }) => ({ ...classroom, role }));
  }

  async create(userId: string, dto: CreateClassroomDto) {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
      select: { id: true, isActive: true },
    });
    if (!academicYear || !academicYear.isActive) {
      throw new NotFoundException('Active academic year not found');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const classroom = await transaction.classroom.create({
          data: {
            name: dto.name.trim(),
            code: dto.code.trim().toUpperCase(),
            academicYearId: dto.academicYearId,
            rankingMode: dto.rankingMode ?? RankingMode.TOTAL_SCORE,
          },
          select: classroomSelect,
        });
        await transaction.classMembership.create({
          data: {
            userId,
            classroomId: classroom.id,
            role: ClassRole.HOMEROOM_TEACHER,
          },
        });
        return { ...classroom, role: ClassRole.HOMEROOM_TEACHER };
      });
    } catch (error) {
      this.throwIfUniqueConstraint(error);
    }
  }

  async findOne(id: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id, isActive: true },
      select: classroomSelect,
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }

  async update(id: string, dto: UpdateClassroomDto) {
    try {
      return await this.prisma.classroom.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
          ...(dto.rankingMode !== undefined && { rankingMode: dto.rankingMode }),
        },
        select: classroomSelect,
      });
    } catch (error) {
      this.throwIfUniqueConstraint(error);
    }
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.prisma.$transaction(async (transaction) => {
      const update = await transaction.classroom.updateMany({
        where: { id, isActive: true },
        data: { isActive: false },
      });
      if (update.count === 0) {
        throw new NotFoundException('Classroom not found');
      }
      await transaction.classMembership.updateMany({
        where: { classroomId: id, isActive: true },
        data: { isActive: false },
      });
    });
    return { success: true };
  }

  private throwIfUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Classroom code already exists in this academic year');
    }
    throw error;
  }
}
