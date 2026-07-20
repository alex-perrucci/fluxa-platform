import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PRINTER_PURPOSES, PRINTER_STATUSES } from '../printing.constants';

export class UpdatePrinterDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsIn(PRINTER_PURPOSES)
  purpose?: (typeof PRINTER_PURPOSES)[number];

  @IsOptional()
  @IsUUID()
  agentDeviceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  driver?: string;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(120)
  paperWidthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(80)
  charactersPerLine?: number;

  @IsOptional()
  @IsBoolean()
  supportsCut?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsDrawer?: boolean;

  @IsOptional()
  @IsIn(PRINTER_STATUSES)
  status?: (typeof PRINTER_STATUSES)[number];
}
