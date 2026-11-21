import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username or email' })
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  usernameOrEmail!: string;

  @ApiProperty({ minLength: 12, maxLength: 72, writeOnly: true, description: 'Maximum 72 UTF-8 bytes' })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}
