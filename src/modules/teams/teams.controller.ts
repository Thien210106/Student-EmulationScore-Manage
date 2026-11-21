import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamLeaderDto } from './dto/team-leader.dto';
import { TeamMemberDto } from './dto/team-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get('classrooms/:classroomId/teams')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Teams, active memberships, and current team leaders' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.findByClassroom(classroomId, user.id);
  }

  @Post('classrooms/:classroomId/teams')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Create a team in a classroom' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.create(classroomId, dto, user.id);
  }

  @Patch('teams/:id')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'team')
  @ApiOkResponse({ description: 'Update a team' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.update(id, dto, user.id);
  }

  @Post('teams/:id/members')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'team')
  @ApiCreatedResponse({ description: 'Add a student enrollment while preserving team history' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TeamMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.addMember(id, dto, user.id);
  }

  @Delete('teams/:id/members/:memberId')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'team')
  @ApiOkResponse({ description: 'End a membership without deleting its history' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.removeMember(id, memberId, user.id);
  }

  @Patch('teams/:id/leader')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'team')
  @ApiOkResponse({ description: 'Change team leader and preserve each leadership period' })
  setLeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TeamLeaderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.setLeader(id, dto, user.id);
  }
}
