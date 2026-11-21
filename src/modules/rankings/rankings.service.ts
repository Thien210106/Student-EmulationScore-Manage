import { Injectable } from '@nestjs/common';
import { PointsService } from '../points/points.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class RankingsService {
  constructor(
    private readonly points: PointsService,
    private readonly reports: ReportsService,
  ) {}

  teams(classroomId: string, weekId: string, userId: string) {
    return this.points.teamRankings(classroomId, weekId, userId);
  }

  students(classroomId: string, weekId: string, userId: string) {
    return this.reports.weeklyStudents(classroomId, weekId, userId);
  }
}
