import { PartialType } from '@nestjs/swagger';
import { CreateCriterionDto } from './create-criterion.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCriterionDto extends PartialType(CreateCriterionDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
