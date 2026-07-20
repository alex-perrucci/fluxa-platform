import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateOrderItemDto {
  @IsUUID()
  mutationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  quantityAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
