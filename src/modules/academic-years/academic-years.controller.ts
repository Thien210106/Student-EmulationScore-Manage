import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@ApiTags('Academic years')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly academicYears: AcademicYearsService) {}

  @Get()
  @ApiOkResponse({ description: 'List active academic years for classroom creation' })
  findActive() {
    return this.academicYears.findActive();
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create an active academic year for classroom creation' })
  create(@Body() dto: CreateAcademicYearDto) {
    return this.academicYears.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get an active academic year' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicYears.findOne(id);
  }
}
