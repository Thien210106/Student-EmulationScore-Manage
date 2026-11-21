import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdjustPointDto } from '../points/dto/adjust-point.dto';
import { PointAdjustmentsService } from './point-adjustments.service';

@ApiTags('Point adjustments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('points/:pointRecordId/adjustments')
export class PointAdjustmentsController {
  constructor(private readonly adjustments: PointAdjustmentsService) {}

  @Get()
  @ApiOkResponse({ description: 'List immutable adjustment history for an accessible point record' })
  findByPointRecord(
    @Param('pointRecordId', ParseUUIDPipe) pointRecordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adjustments.findByPointRecord(pointRecordId, user.id);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Adjust a point value and append an immutable audit record' })
  create(
    @Param('pointRecordId', ParseUUIDPipe) pointRecordId: string,
    @Body() dto: AdjustPointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adjustments.create(pointRecordId, dto, user.id);
  }
}
