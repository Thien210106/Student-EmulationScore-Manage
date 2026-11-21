import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RankingsService } from './rankings.service';

@ApiTags('Rankings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller('classrooms/:classroomId/weeks/:weekId/rankings')
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  @Get('teams')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Weekly team leaderboard, scoped to the current classroom role' })
  teams(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rankings.teams(classroomId, weekId, user.id);
  }

  @Get('students')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Weekly individual leaderboard with role-scoped results' })
  students(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rankings.students(classroomId, weekId, user.id);
  }
}
