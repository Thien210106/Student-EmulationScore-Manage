import { Module } from '@nestjs/common';
import { ClassroomImportsController } from './classroom-imports.controller';
import { ClassroomImportsService } from './classroom-imports.service';

@Module({
  controllers: [ClassroomImportsController],
  providers: [ClassroomImportsService],
})
export class ClassroomImportsModule {}
