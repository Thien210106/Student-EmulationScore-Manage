import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateWeekDto } from './dto/create-week.dto';
import { WeeksService } from './weeks.service';

@ApiTags('Competition weeks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class WeeksController {
  constructor(private readonly weeks: WeeksService) {}

  @Get('classrooms/:classroomId/weeks')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Competition weeks in the classroom' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.weeks.findByClassroom(classroomId, user.id);
  }

  @Get('weeks/:id')
  @ApiOkResponse({ description: 'Get a competition week visible to a classroom member' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.weeks.findOne(id, user.id);
  }

  @Post('classrooms/:classroomId/weeks')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Create a Monday-to-Sunday competition week' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateWeekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.weeks.create(classroomId, dto, user.id);
  }

  @Post('weeks/:id/close')
  @ApiOkResponse({ description: 'Close a week to further point changes' })
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.weeks.close(id, user.id);
  }

  @Post('weeks/:id/reopen')
  @ApiOkResponse({ description: 'Reopen a week for authorized point changes' })
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.weeks.reopen(id, user.id);
  }
}
