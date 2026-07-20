import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePriceListDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code!: string;

  @IsString()
  @Length(2, 140)
  name!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  endsAt?: string;
}
