import { IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class CancelPrintJobDto {
  @IsUUID()
  mutationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Length(2, 500)
  reason!: string;
}
