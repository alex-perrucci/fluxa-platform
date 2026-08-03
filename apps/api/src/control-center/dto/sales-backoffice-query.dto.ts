import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FISCAL_DOCUMENT_STATUSES } from '../../fiscal/fiscal.constants';
import { ORDER_STATUSES } from '../../orders/order.constants';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../../payments/payment.constants';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class BackofficeScopeQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}

class PaginatedBackofficeQueryDto extends BackofficeScopeQueryDto {
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
  pageSize = 30;
}

export class SalesListQueryDto extends PaginatedBackofficeQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];
}

export class PaymentBackofficeQueryDto extends PaginatedBackofficeQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];
}

export class FiscalBackofficeQueryDto extends PaginatedBackofficeQueryDto {
  @IsOptional()
  @IsIn(FISCAL_DOCUMENT_STATUSES)
  status?: (typeof FISCAL_DOCUMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(['SALE', 'VOID'] as const)
  type?: 'SALE' | 'VOID';
}

export class SalesReportQueryDto extends BackofficeScopeQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: (typeof PAYMENT_METHODS)[number];
}
