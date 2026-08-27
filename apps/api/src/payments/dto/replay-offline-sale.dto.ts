import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const OFFLINE_ORDER_SERVICE_MODES = ['COUNTER'] as const;
const PRODUCT_UNITS = ['EACH', 'WEIGHT', 'VOLUME'] as const;

export class OfflineSaleItemDto {
  @IsUUID()
  clientItemId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsString()
  @MaxLength(50)
  productCodeSnapshot!: string;

  @IsString()
  @MaxLength(180)
  productNameSnapshot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  variantCodeSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantNameSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  skuSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcodeSnapshot?: string;

  @IsUUID()
  categoryIdSnapshot!: string;

  @IsString()
  @MaxLength(40)
  categoryCodeSnapshot!: string;

  @IsString()
  @MaxLength(120)
  categoryNameSnapshot!: string;

  @IsIn(PRODUCT_UNITS)
  unitSnapshot!: (typeof PRODUCT_UNITS)[number];

  @IsInt()
  @Min(1)
  quantityAmount!: number;

  @IsInt()
  @Min(0)
  @Max(6)
  quantityScale!: number;

  @IsInt()
  @Min(1)
  unitPriceCents!: number;

  @IsUUID()
  vatRateIdSnapshot!: string;

  @IsString()
  @MaxLength(40)
  vatCodeSnapshot!: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  vatRateBasisPointsSnapshot!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  vatNatureCodeSnapshot?: string;

  @IsUUID()
  priceListIdSnapshot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OfflineSalePaymentDto {
  @IsIn(['CASH'])
  method!: 'CASH';

  @IsIn(['CASH'])
  provider!: 'CASH';

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsInt()
  @Min(1)
  tenderedCents!: number;
}

export class ReplayOfflineSaleDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  clientOrderId!: string;

  @IsUUID()
  clientCheckoutId!: string;

  @IsUUID()
  clientPaymentId!: string;

  @IsUUID()
  locationId!: string;

  @IsIn(OFFLINE_ORDER_SERVICE_MODES)
  serviceMode!: (typeof OFFLINE_ORDER_SERVICE_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsISO8601()
  createdAt!: string;

  @ValidateNested({ each: true })
  @Type(() => OfflineSaleItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  items!: OfflineSaleItemDto[];

  @ValidateNested()
  @Type(() => OfflineSalePaymentDto)
  payment!: OfflineSalePaymentDto;
}
