import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TeamLeaderDto {
  @ApiProperty({ format: 'uuid', description: 'ClassStudent enrollment ID of the new leader' })
  @IsUUID()
  classStudentId!: string;
}
