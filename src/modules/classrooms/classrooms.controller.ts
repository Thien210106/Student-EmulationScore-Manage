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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClassroomsService } from './classrooms.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';

@ApiTags('Classrooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  @ApiOkResponse({ description: 'Classrooms the current user belongs to' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.classrooms.findAll(user.id);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create a classroom and assign its creator as homeroom teacher' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClassroomDto) {
    return this.classrooms.create(user.id, dto);
  }

  @Get(':id')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT], 'classroom', 'id')
  @ApiOkResponse({ description: 'Classroom details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.findOne(id);
  }

  @Patch(':id')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom', 'id')
  @ApiOkResponse({ description: 'Updated classroom details' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassroomDto) {
    return this.classrooms.update(id, dto);
  }

  @Delete(':id')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom', 'id')
  @ApiOkResponse({ description: 'Classroom and memberships deactivated without deleting history' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.remove(id);
  }
}
