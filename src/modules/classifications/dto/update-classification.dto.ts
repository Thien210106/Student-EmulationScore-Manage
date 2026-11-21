import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ClassificationStatus } from '@prisma/client';
import { CreateClassificationDto } from './create-classification.dto';

export class UpdateClassificationDto extends PartialType(CreateClassificationDto) {
  @IsOptional()
  @IsEnum(ClassificationStatus)
  status?: ClassificationStatus;
}
