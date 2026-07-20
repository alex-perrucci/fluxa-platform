import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddOrderItemDto {
  @IsUUID()
  mutationId!: string;

  @IsUUID()
  clientItemId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  quantityAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
