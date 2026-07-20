import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class IssueFiscalDocumentDto {
  @IsUUID()
  clientRequestId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{8}$/)
  lotteryCode?: string;
}
