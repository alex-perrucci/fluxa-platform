import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class PlatformLocationAccessItemDto {
  @IsUUID()
  locationId!: string;

  @IsBoolean()
  canManageLocation!: boolean;

  @IsBoolean()
  canManageEvents!: boolean;

  @IsBoolean()
  canManageTables!: boolean;

  @IsBoolean()
  canManageFloorPlan!: boolean;

  @IsBoolean()
  canManageStaff!: boolean;
}

export class ReplacePlatformLocationAccessDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlatformLocationAccessItemDto)
  assignments!: PlatformLocationAccessItemDto[];
}
