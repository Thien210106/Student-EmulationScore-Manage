import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { PointAdjustmentsController } from './point-adjustments.controller';
import { PointAdjustmentsService } from './point-adjustments.service';

@Module({
  imports: [PointsModule],
  controllers: [PointAdjustmentsController],
  providers: [PointAdjustmentsService],
})
export class PointAdjustmentsModule {}
