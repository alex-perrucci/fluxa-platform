import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpsertLocationProductDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
