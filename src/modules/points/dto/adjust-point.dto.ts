import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class AdjustPointDto {
  @ApiProperty({ minimum: 0, maximum: 999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  newPoint!: number;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/)
  reason!: string;
}
