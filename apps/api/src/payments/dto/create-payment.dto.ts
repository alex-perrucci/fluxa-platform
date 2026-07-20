import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { PAYMENT_METHODS, PAYMENT_PROVIDERS } from '../payment.constants';

export class CreatePaymentDto {
  @IsUUID()
  clientPaymentId!: string;

  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @IsIn(PAYMENT_PROVIDERS)
  provider!: (typeof PAYMENT_PROVIDERS)[number];

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tenderedCents?: number;
}
