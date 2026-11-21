import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @IsJWT()
  @MaxLength(4096)
  refreshToken!: string;
}
