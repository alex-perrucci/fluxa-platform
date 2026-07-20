import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ORDER_SERVICE_MODES } from '../order.constants';

export class CreateOrderDto {
  @IsUUID()
  clientOrderId!: string;

  @IsUUID()
  locationId!: string;

  @IsIn(ORDER_SERVICE_MODES)
  serviceMode!: (typeof ORDER_SERVICE_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
