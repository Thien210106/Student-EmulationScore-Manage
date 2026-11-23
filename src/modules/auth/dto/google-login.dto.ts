import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google OpenID Connect ID token', maxLength: 8192 })
  @IsString()
  @Length(100, 8192)
  credential!: string;

  @ApiProperty({ description: 'One-time nonce sent when initializing Google Identity Services' })
  @IsString()
  @Length(16, 128)
  nonce!: string;
}
