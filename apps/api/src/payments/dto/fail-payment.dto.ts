import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class FailPaymentDto {
  @IsUUID()
  mutationId!: string;

  @IsString()
  @Length(1, 80)
  failureCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerEventId?: string;
}
