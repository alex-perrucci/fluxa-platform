// PHASE_8_TRUE_CONTROL_CENTER
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
  'REFUND_PENDING',
  'REFUNDED',
] as const;

export class MerchantReservationListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
