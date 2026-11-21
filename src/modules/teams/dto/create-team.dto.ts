import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
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
}
