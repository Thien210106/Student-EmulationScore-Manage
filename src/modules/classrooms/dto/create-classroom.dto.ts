import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RankingMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ maxLength: 30 })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/\S/)
  code!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  academicYearId!: string;

  @ApiPropertyOptional({ enum: RankingMode, default: RankingMode.TOTAL_SCORE })
  @IsOptional()
  @IsEnum(RankingMode)
  rankingMode?: RankingMode;
}
