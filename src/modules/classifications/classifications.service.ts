import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassRole, ClassificationStatus, Prisma } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassificationDto } from './dto/create-classification.dto';
import { UpdateClassificationDto } from './dto/update-classification.dto';

const classificationSelect = {
  id: true,
  classroomId: true,
  name: true,
  minScore: true,
  maxScore: true,
  description: true,
  status: true,
  sortOrder: true,
} as const;

@Injectable()
export class ClassificationsService {
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
    return this.prisma.classificationRule.findMany({
      where: { classroomId },
      select: classificationSelect,
      orderBy: [{ sortOrder: 'asc' }, { minScore: 'desc' }],
    });
  }

  async create(classroomId: string, dto: CreateClassificationDto, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    this.validateRange(dto.minScore, dto.maxScore);
    try {
      return await this.prisma.classificationRule.create({
        data: {
          classroomId,
          name: dto.name.trim(),
          minScore: dto.minScore,
          maxScore: dto.maxScore ?? null,
          description: dto.description?.trim() || null,
        },
        select: classificationSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error);
    }
  }

  async update(id: string, dto: UpdateClassificationDto, userId: string) {
    const rule = await this.prisma.classificationRule.findUnique({
      where: { id },
      select: { id: true, classroomId: true },
    });
    if (!rule) {
      throw new NotFoundException('Classification rule not found');
    }
    await this.access.requireRole(userId, rule.classroomId, [ClassRole.HOMEROOM_TEACHER]);
    const existing = await this.prisma.classificationRule.findUniqueOrThrow({
      where: { id },
      select: { minScore: true, maxScore: true },
    });
    const minScore =
      dto.minScore === undefined ? existing.minScore.toNumber() : dto.minScore;
    const maxScore =
      dto.maxScore === undefined
        ? existing.maxScore?.toNumber() ?? null
        : dto.maxScore;
    this.validateRange(minScore, maxScore);

    try {
      return await this.prisma.classificationRule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.minScore !== undefined && { minScore: dto.minScore }),
          ...(dto.maxScore !== undefined && { maxScore: dto.maxScore }),
          ...(dto.description !== undefined && {
            description: dto.description.trim() || null,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
        select: classificationSelect,
      });
    } catch (error) {
      this.throwIfConstraint(error);
    }
  }

  async remove(id: string, userId: string): Promise<{ success: true }> {
    const rule = await this.prisma.classificationRule.findUnique({
      where: { id },
      select: { id: true, classroomId: true, status: true },
    });
    if (!rule) {
      throw new NotFoundException('Classification rule not found');
    }
    await this.access.requireRole(userId, rule.classroomId, [
      ClassRole.HOMEROOM_TEACHER,
    ]);
    if (rule.status !== ClassificationStatus.INACTIVE) {
      await this.prisma.classificationRule.update({
        where: { id },
        data: { status: ClassificationStatus.INACTIVE },
      });
    }
    return { success: true };
  }

  private validateRange(minScore: number, maxScore: number | null | undefined): void {
    if (maxScore !== null && maxScore !== undefined && maxScore <= minScore) {
      throw new ConflictException('Classification maxScore must be greater than minScore');
    }
  }

  private throwIfConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004'].includes(error.code)
    ) {
      throw new ConflictException(
        'Classification name or active score range conflicts with an existing rule',
      );
    }
    throw error;
  }
}
