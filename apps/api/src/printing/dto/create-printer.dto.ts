import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PRINTER_PURPOSES } from '../printing.constants';

export class CreatePrinterDto {
  @IsUUID()
  locationId!: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsIn(PRINTER_PURPOSES)
  purpose!: (typeof PRINTER_PURPOSES)[number];

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
}
