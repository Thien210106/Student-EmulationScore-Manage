import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { ClassRole } from '@prisma/client';
import { ClassroomRoles } from '../../common/decorators/classroom-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomRolesGuard } from '../../common/guards/classroom-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClassroomImportsService, UploadedWorkbook } from './classroom-imports.service';

const workbookInterceptor = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      callback(new BadRequestException('Only .xlsx workbooks are supported.'), false);
      return;
    }
    callback(null, true);
  },
});

@ApiTags('Classroom imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ClassroomRolesGuard)
@Controller('classrooms/:classroomId/imports')
export class ClassroomImportsController {
  constructor(private readonly imports: ClassroomImportsService) {}

  @Post('preview')
  @UseInterceptors(workbookInterceptor)
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Validate and preview workbook rosters and criteria without changes' })
  preview(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @UploadedFile() file: UploadedWorkbook,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.preview(classroomId, user.id, file);
  }

  @Post()
  @UseInterceptors(workbookInterceptor)
  @ClassroomRoles([ClassRole.HOMEROOM_TEACHER], 'classroom')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Import team rosters and score criteria from a workbook' })
  importWorkbook(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @UploadedFile() file: UploadedWorkbook,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.importWorkbook(classroomId, user.id, file);
  }
}
