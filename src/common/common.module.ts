import { Global, Module } from '@nestjs/common';
import { ClassroomRolesGuard } from './guards/classroom-roles.guard';
import { ClassroomAccessService } from './services/classroom-access.service';
import { PasswordService } from './services/password.service';

@Global()
@Module({
  providers: [ClassroomRolesGuard, ClassroomAccessService, PasswordService],
  exports: [ClassroomRolesGuard, ClassroomAccessService, PasswordService],
})
export class CommonModule {}
