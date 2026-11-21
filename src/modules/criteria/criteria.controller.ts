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
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';
import { CriteriaService } from './criteria.service';

@ApiTags('Criteria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller()
export class CriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get('classrooms/:classroomId/criteria')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Scoring criteria for the classroom' })
  findByClassroom(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.criteria.findByClassroom(classroomId, user.id);
  }

  @Post('classrooms/:classroomId/criteria')
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiCreatedResponse({ description: 'Create a criterion in the classroom' })
  create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateCriterionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.criteria.create(classroomId, dto, user.id);
  }

  @Patch('criteria/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Update or deactivate a criterion without deleting history' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCriterionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.criteria.update(id, dto, user.id);
  }

  @Delete('criteria/:id')
  @ApiOkResponse({ description: 'Deactivate a criterion without deleting point history' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.criteria.remove(id, user.id);
  }
}
