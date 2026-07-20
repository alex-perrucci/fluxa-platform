import { IsInt, IsUUID, Min } from 'class-validator';

export class PrintJobMutationDto {
  @IsUUID()
  mutationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
