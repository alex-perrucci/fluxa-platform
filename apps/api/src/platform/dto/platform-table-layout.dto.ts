import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlatformTableLayoutTableDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;
}

export class PlatformTableLayoutDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  areaId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlatformTableLayoutTableDto)
  tables!: PlatformTableLayoutTableDto[];
}
