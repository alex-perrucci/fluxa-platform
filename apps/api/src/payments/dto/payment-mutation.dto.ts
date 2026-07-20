import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PaymentMutationDto {
  @IsUUID()
  mutationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
