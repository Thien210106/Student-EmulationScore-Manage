import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClassRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClassroomAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRole(
    userId: string,
    classroomId: string,
    roles: ClassRole[],
  ): Promise<void> {
    const membership = await this.prisma.classMembership.findFirst({
      where: {
        userId,
        classroomId,
        role: { in: roles },
        isActive: true,
        classroom: { isActive: true },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have the required classroom role');
    }
  }

  async requireAnyRole(
    userId: string,
    classroomIds: string[],
    roles: ClassRole[],
  ): Promise<void> {
    if (classroomIds.length === 0) {
      throw new ForbiddenException('You do not have the required classroom role');
    }
    const membership = await this.prisma.classMembership.findFirst({
      where: {
        userId,
        classroomId: { in: classroomIds },
        role: { in: roles },
        isActive: true,
        classroom: { isActive: true },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have the required classroom role');
    }
  }
}
