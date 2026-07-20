import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class FiscalMutationDto {
  @IsUUID()
  mutationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class VoidFiscalDocumentDto extends FiscalMutationDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}
