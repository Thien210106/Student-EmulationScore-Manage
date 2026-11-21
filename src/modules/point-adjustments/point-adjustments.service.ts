import { Injectable } from '@nestjs/common';
import { PointsService } from '../points/points.service';
import { AdjustPointDto } from '../points/dto/adjust-point.dto';

@Injectable()
export class PointAdjustmentsService {
  constructor(private readonly points: PointsService) {}

  create(pointRecordId: string, dto: AdjustPointDto, userId: string) {
    return this.points.adjust(pointRecordId, dto, userId);
  }

  findByPointRecord(pointRecordId: string, userId: string) {
    return this.points.findAdjustments(pointRecordId, userId);
  }
}
