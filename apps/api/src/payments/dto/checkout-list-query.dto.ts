import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CHECKOUT_STATUSES } from '../payment.constants';

export class CheckoutListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(CHECKOUT_STATUSES)
  status?: (typeof CHECKOUT_STATUSES)[number];

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
  pageSize = 25;
}
