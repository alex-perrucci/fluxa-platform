import { IsInt, IsUUID, Min } from 'class-validator';
export class SessionMutationDto {
  @IsUUID() mutationId!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
