import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CatalogQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
