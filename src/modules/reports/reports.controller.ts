import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller('classrooms/:classroomId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('weeks/:weekId/students')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiOkResponse({ description: 'Role-scoped weekly student scores and classifications' })
  weeklyStudents(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.weeklyStudents(classroomId, weekId, user.id);
  }

  @Get('weeks/:weekId/students/export')
  @ClassroomRoles(
    [ClassRole.HOMEROOM_TEACHER, ClassRole.TEAM_LEADER, ClassRole.STUDENT],
    'classroom',
  )
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'Download the role-scoped weekly student report as Excel' })
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportWeeklyStudents(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const buffer = await this.reports.exportWeeklyStudents(classroomId, weekId, user.id);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="weekly-report-${weekId}.xlsx"`,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}
