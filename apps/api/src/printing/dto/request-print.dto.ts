import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RequestPrintDto {
  @IsUUID()
  clientRequestId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  copies?: number;

  @IsOptional()
  @IsUUID()
  printerId?: string;
}
