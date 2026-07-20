import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PRINT_JOB_STATUSES } from '../printing.constants';

export class PrintJobListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  printerId?: string;

  @IsOptional()
  @IsIn(PRINT_JOB_STATUSES)
  status?: (typeof PRINT_JOB_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
