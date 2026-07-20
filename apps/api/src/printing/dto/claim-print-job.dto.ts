import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ClaimPrintJobDto {
  @IsUUID()
  printerId!: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  leaseSeconds = 60;
}
