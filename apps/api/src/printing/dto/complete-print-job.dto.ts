import { IsUUID } from 'class-validator';

export class CompletePrintJobDto {
  @IsUUID()
  leaseToken!: string;
}
