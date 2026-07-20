import { IsInt, IsUUID, Min } from 'class-validator';

export class OrderMutationDto {
  @IsUUID()
  mutationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
