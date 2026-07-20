import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CapturePaymentDto {
  @IsUUID()
  mutationId!: string;

  @IsString()
  @Length(1, 200)
  providerReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerEventId?: string;
}
