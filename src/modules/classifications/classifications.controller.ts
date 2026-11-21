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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClassificationsService } from './classifications.service';
import { CreateClassificationDto } from './dto/create-classification.dto';
import { UpdateClassificationDto } from './dto/update-classification.dto';

@ApiTags('Classifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class ClassificationsController {
  constructor(private readonly classifications: ClassificationsService) {}

  @Get('classrooms/:classroomId/classifications')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Classification rules configured for the classroom' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classifications.findByClassroom(classroomId, user.id);
  }

  @Post('classrooms/:classroomId/classifications')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Create a classification score interval' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateClassificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classifications.create(classroomId, dto, user.id);
  }

  @Patch('classifications/:id')
  @ApiOkResponse({ description: 'Update or deactivate a classification rule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classifications.update(id, dto, user.id);
  }

  @Delete('classifications/:id')
  @ApiOkResponse({ description: 'Deactivate a classification without deleting it' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classifications.remove(id, user.id);
  }
}
