import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'student_01', minLength: 3, maxLength: 50 })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username!: string;

  @ApiProperty({ example: 'student@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Nguyen Van A', maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/)
  fullName!: string;

  @ApiProperty({ minLength: 12, maxLength: 72, writeOnly: true, description: 'Maximum 72 UTF-8 bytes' })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}
