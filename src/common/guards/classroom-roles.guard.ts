import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClassRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLASSROOM_ROLES_KEY,
  ClassroomRolesMetadata,
} from '../decorators/classroom-roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

interface GuardRequest {
  user: AuthenticatedUser;
  params: Record<string, string | undefined>;
}

@Injectable()
export class ClassroomRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<ClassroomRolesMetadata>(
      CLASSROOM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const resourceId = request.params[metadata.param];
    if (!resourceId || !request.user?.id) {
      throw new ForbiddenException('Classroom access is required');
    }

    const classroomIds = await this.resolveClassroomIds(metadata, resourceId);
    if (classroomIds.length === 0) {
      throw new ForbiddenException('Classroom access is required');
    }

    const membership = await this.prisma.classMembership.findFirst({
      where: {
        userId: request.user.id,
        classroomId: { in: classroomIds },
        role: { in: metadata.roles },
        isActive: true,
        classroom: { isActive: true },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have the required classroom role');
    }
    return true;
  }

  private async resolveClassroomIds(
    metadata: ClassroomRolesMetadata,
    resourceId: string,
  ): Promise<string[]> {
    if (metadata.resource === 'classroom') {
      const classroom = await this.prisma.classroom.findFirst({
        where: { id: resourceId, isActive: true },
        select: { id: true },
      });
      return classroom ? [classroom.id] : [];
    }

    if (metadata.resource === 'team') {
      const team = await this.prisma.team.findFirst({
        where: { id: resourceId, classroom: { isActive: true } },
        select: { classroomId: true },
      });
      return team ? [team.classroomId] : [];
    }

    const student = await this.prisma.student.findUnique({
      where: { id: resourceId },
      select: {
        classRecords: {
          where: { isActive: true, classroom: { isActive: true } },
          select: { classroomId: true },
        },
      },
    });
    return student?.classRecords.map(({ classroomId }) => classroomId) ?? [];
  }
}
