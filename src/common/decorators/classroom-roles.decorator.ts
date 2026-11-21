import { SetMetadata } from '@nestjs/common';
import { ClassRole } from '@prisma/client';

export const CLASSROOM_ROLES_KEY = 'classroom-roles';

export type ClassroomResource = 'classroom' | 'team' | 'student';

export interface ClassroomRolesMetadata {
  roles: ClassRole[];
  resource: ClassroomResource;
  param: string;
}

export const ClassroomRoles = (
  roles: ClassRole[],
  resource: ClassroomResource = 'classroom',
  param = resource === 'classroom' ? 'classroomId' : 'id',
) =>
  SetMetadata(CLASSROOM_ROLES_KEY, {
    roles,
    resource,
    param,
  } satisfies ClassroomRolesMetadata);
