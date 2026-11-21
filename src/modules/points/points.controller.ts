import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePointDto } from './dto/create-point.dto';
import { PointsService } from './points.service';

@ApiTags('Points')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get('classrooms/:classroomId/points')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Point records visible to the current classroom member' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Query('weekId', new ParseUUIDPipe({ optional: true })) weekId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.points.findByClassroom(classroomId, weekId, user.id);
  }

  @Get('points/:id')
  @ApiOkResponse({ description: 'Get a point record visible to the current classroom role' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.points.findOne(id, user.id);
  }

  @Get('students/:studentId/points')
  @ApiOkResponse({ description: 'Point history visible to the student, team leader, or teacher' })
  findStudentHistory(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.points.findStudentHistory(studentId, user.id);
  }

  @Post('classrooms/:classroomId/points')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Record a point event for an enrolled student' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreatePointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.points.create(classroomId, dto, user.id);
  }

  @Delete('points/:id')
  @ApiOkResponse({ description: 'Void a point record without deleting its audit history' })
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.points.void(id, user.id);
  }

  @Get('classrooms/:classroomId/weeks/:weekId/rankings')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Weekly team leaderboard, scoped to the current member role' })
  teamRankings(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.points.teamRankings(classroomId, weekId, user.id);
  }
}
