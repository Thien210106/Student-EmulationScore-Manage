import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CriterionType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCriterionDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/\S/)
  code!: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ enum: CriterionType })
  @IsEnum(CriterionType)
  type!: CriterionType;

  @ApiProperty({ minimum: 0, maximum: 999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  defaultPoint!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  maxPoint?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  minPoint?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
