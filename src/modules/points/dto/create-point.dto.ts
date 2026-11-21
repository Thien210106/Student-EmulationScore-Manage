import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePointDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classStudentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  criterionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  weekId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
