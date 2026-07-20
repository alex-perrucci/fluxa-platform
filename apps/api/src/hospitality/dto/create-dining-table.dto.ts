import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
export class CreateDiningTableDto {
  @IsUUID() locationId!: string;
  @IsUUID() areaId!: string;
  @IsString() @Length(1, 40) @Matches(/^[A-Z0-9_.-]+$/i) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsInt() @Min(1) @Max(100) capacity!: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
