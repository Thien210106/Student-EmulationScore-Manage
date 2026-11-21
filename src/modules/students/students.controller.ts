import {
  Body,
  Controller,
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
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('classrooms/:classroomId/students')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Active student enrollments in a classroom' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.students.findByClassroom(classroomId, user.id);
  }

  @Post('classrooms/:classroomId/students')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Create a student account, profile, and classroom enrollment' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.students.create(classroomId, dto, user.id);
  }

  @Get('students/:id')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'student',
  )
  @ApiOkResponse({ description: 'Student profile for an accessible classroom' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.students.findOne(id, user);
  }

  @Patch('students/:id')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'student')
  @ApiOkResponse({ description: 'Updated student profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.students.update(id, dto, user.id);
  }
}
