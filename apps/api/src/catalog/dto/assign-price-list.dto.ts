import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AssignPriceListDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
