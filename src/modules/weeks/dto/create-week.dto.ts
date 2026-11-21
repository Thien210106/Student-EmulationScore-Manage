import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWeekDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ format: 'date', example: '2026-09-07' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-09-13' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
}
