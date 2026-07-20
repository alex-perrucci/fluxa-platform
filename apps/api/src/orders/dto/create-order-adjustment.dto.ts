import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ORDER_ADJUSTMENT_TYPES } from '../order.constants';

export class CreateOrderAdjustmentDto {
  @IsUUID()
  mutationId!: string;

  @IsUUID()
  clientAdjustmentId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn(ORDER_ADJUSTMENT_TYPES)
  type!: (typeof ORDER_ADJUSTMENT_TYPES)[number];

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  value!: number;

  @IsString()
  @Length(3, 300)
  reason!: string;
}
