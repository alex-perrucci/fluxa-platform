import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLocationDto {
  @IsUUID()
  merchantId!: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code!: string;

  @IsString()
  @Length(2, 180)
  name!: string;

  @IsString()
  @Length(2, 220)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  addressLine2?: string;

  @IsString()
  @Length(3, 20)
  postalCode!: string;

  @IsString()
  @Length(2, 120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  province?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;
}
