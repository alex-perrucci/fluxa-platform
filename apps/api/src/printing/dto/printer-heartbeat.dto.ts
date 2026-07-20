import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PrinterHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  statusMessage?: string;
}
