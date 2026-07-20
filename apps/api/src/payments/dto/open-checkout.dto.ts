import { IsInt, IsUUID, Min } from 'class-validator';

export class OpenCheckoutDto {
  @IsUUID()
  clientCheckoutId!: string;

  @IsUUID()
  orderId!: string;

  @IsInt()
  @Min(1)
  expectedOrderVersion!: number;
}
