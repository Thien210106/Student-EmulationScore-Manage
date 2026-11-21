import { Injectable } from '@nestjs/common';
import { ClassRole } from '@prisma/client';
import { ClassroomAccessService } from '../../common/services/classroom-access.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassroomAccessService,
  ) {}

  async findByClassroom(classroomId: string, userId: string) {
    await this.access.requireRole(userId, classroomId, [ClassRole.HOMEROOM_TEACHER]);
    return this.prisma.classMembership.findMany({
      where: { classroomId },
      select: {
        id: true,
        role: true,
        isActive: true,
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: [{ role: 'asc' }, { user: { fullName: 'asc' } }],
    });
  }
}
