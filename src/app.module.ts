import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { CriteriaModule } from './modules/criteria/criteria.module';
import { ClassificationsModule } from './modules/classifications/classifications.module';
import { PointsModule } from './modules/points/points.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PointAdjustmentsModule } from './modules/point-adjustments/point-adjustments.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { ClassroomImportsModule } from './modules/classroom-imports/classroom-imports.module';
import { StudentsModule } from './modules/students/students.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { WeeksModule } from './modules/weeks/weeks.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    ClassroomsModule,
    CriteriaModule,
    ClassificationsModule,
    StudentsModule,
    TeamsModule,
    WeeksModule,
    PointsModule,
    ReportsModule,
    AcademicYearsModule,
    MembershipsModule,
    PointAdjustmentsModule,
    RankingsModule,
    ClassroomImportsModule,
  ],
})
export class AppModule {}
