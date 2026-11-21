import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TeamMemberDto {
  @ApiProperty({ format: 'uuid', description: 'ClassStudent enrollment ID' })
  @IsUUID()
  classStudentId!: string;
}
