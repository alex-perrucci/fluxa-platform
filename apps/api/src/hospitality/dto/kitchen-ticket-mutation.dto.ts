import { IsInt, IsUUID, Min } from 'class-validator';
export class KitchenTicketMutationDto {
  @IsUUID() mutationId!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
