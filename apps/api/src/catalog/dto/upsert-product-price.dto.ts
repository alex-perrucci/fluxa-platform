import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertProductPriceDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  endsAt?: string;
}
