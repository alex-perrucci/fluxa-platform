import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class FailPrintJobDto {
  @IsUUID()
  leaseToken!: string;

  @IsString()
  @Length(1, 500)
  error!: string;

  @IsOptional()
  @IsBoolean()
  retryable = true;
}
