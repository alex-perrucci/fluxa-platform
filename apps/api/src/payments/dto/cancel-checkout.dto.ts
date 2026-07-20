import { IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CancelCheckoutDto {
  @IsUUID()
  mutationId!: string;

  @IsString()
  @Length(3, 500)
  @MaxLength(500)
  reason!: string;
}
