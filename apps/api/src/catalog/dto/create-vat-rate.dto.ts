import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVatRateDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  rateBasisPoints!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^N[1-7](?:\.\d{1,2})?$/i)
  natureCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  fiscalDescription?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
