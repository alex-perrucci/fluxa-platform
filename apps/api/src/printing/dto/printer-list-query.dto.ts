import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PRINTER_STATUSES } from '../printing.constants';

export class PrinterListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(PRINTER_STATUSES)
  status?: (typeof PRINTER_STATUSES)[number];

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
