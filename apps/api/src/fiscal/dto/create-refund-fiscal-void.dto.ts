import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRefundFiscalVoidDto {
  @IsUUID()
  mutationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
