import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  clientRefundId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerEventId?: string;
}
