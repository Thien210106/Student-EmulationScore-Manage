import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, Prisma } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';

const criterionSelect = {
  id: true,
  classroomId: true,
  code: true,
  name: true,
  description: true,
  type: true,
  defaultPoint: true,
  minPoint: true,
  maxPoint: true,
  isActive: true,
  sortOrder: true,
} as const;

@Injectable()
export class CriteriaService {
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
    return this.prisma.criterion.findMany({
      where: { classroomId },
      select: criterionSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(classroomId: string, dto: CreateCriterionDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    this.validateBounds(dto.minPoint, dto.defaultPoint, dto.maxPoint);
    try {
      return await this.prisma.criterion.create({
        data: {
          classroomId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          defaultPoint: dto.defaultPoint,
          minPoint: dto.minPoint ?? null,
          maxPoint: dto.maxPoint ?? null,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: criterionSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error);
    }
  }

  async update(id: string, dto: UpdateCriterionDto, userId: string) {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      select: { id: true, classroomId: true, type: true },
    });
    if (!criterion) {
      throw new NotFoundException('Criterion not found');
    }
    await this.access.requireRole(userId, criterion.classroomId, [
      ClassRole.HOMEROOM_TEACHER,
    ]);

    const bounds = await this.prisma.criterion.findUniqueOrThrow({
      where: { id },
      select: { minPoint: true, defaultPoint: true, maxPoint: true },
    });
    const minPoint = dto.minPoint === undefined ? bounds.minPoint?.toNumber() : dto.minPoint;
    const defaultPoint =
      dto.defaultPoint === undefined ? bounds.defaultPoint.toNumber() : dto.defaultPoint;
    const maxPoint = dto.maxPoint === undefined ? bounds.maxPoint?.toNumber() : dto.maxPoint;
    this.validateBounds(minPoint, defaultPoint, maxPoint);

    if (dto.type !== undefined && dto.type !== criterion.type) {
      const pointCount = await this.prisma.pointRecord.count({
        where: { criterionId: id },
      });
      if (pointCount > 0) {
        throw new ConflictException('Criterion type cannot change after points are recorded');
      }
    }

    try {
      return await this.prisma.criterion.update({
        where: { id },
        data: {
          ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && {
            description: dto.description.trim() || null,
          }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.defaultPoint !== undefined && { defaultPoint: dto.defaultPoint }),
          ...(dto.minPoint !== undefined && { minPoint: dto.minPoint }),
          ...(dto.maxPoint !== undefined && { maxPoint: dto.maxPoint }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
        select: criterionSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error);
    }
  }

  async remove(id: string, userId: string): Promise<{ success: true }> {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      select: { id: true, classroomId: true, isActive: true },
    });
    if (!criterion) {
      throw new NotFoundException('Criterion not found');
    }
    await this.access.requireRole(userId, criterion.classroomId, [
      ClassRole.HOMEROOM_TEACHER,
    ]);
    if (criterion.isActive) {
      await this.prisma.criterion.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return { success: true };
  }

  private validateBounds(
    minPoint: number | null | undefined,
    defaultPoint: number,
    maxPoint: number | null | undefined,
  ): void {
    if (
      (minPoint !== null && minPoint !== undefined && minPoint > defaultPoint) ||
      (maxPoint !== null && maxPoint !== undefined && defaultPoint > maxPoint) ||
      (minPoint !== null &&
        minPoint !== undefined &&
        maxPoint !== null &&
        maxPoint !== undefined &&
        minPoint > maxPoint)
    ) {
      throw new ConflictException('Criterion points must satisfy minPoint <= defaultPoint <= maxPoint');
    }
  }

  private throwIfConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2004')
    ) {
      throw new ConflictException('Criterion code or point bounds conflict with existing data');
    }
    throw error;
  }
}
