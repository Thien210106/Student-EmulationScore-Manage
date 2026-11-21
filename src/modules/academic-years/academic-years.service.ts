import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

const academicYearSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  isActive: true,
} as const;

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  findActive() {
    return this.prisma.academicYear.findMany({
      where: { isActive: true },
      select: academicYearSelect,
      orderBy: { startDate: 'desc' },
    });
  }

  async create(dto: CreateAcademicYearDto) {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('Academic year end date must be after its start date');
    }

    try {
      return await this.prisma.academicYear.create({
        data: {
          name: dto.name.trim(),
          startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
          endDate: new Date(`${dto.endDate}T00:00:00.000Z`),
          isActive: true,
        },
        select: academicYearSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An academic year with this name already exists');
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id, isActive: true },
      select: academicYearSelect,
    });
    if (!academicYear) {
      throw new NotFoundException('Active academic year not found');
    }
    return academicYear;
  }
}
