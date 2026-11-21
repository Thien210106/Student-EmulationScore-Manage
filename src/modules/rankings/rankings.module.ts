import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { ReportsModule } from '../reports/reports.module';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';

@Module({
  imports: [PointsModule, ReportsModule],
  controllers: [RankingsController],
  providers: [RankingsService],
})
export class RankingsModule {}
