import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddManualOrderItemDto {
  @IsUUID()
  mutationId!: string;

  @IsUUID()
  clientItemId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
