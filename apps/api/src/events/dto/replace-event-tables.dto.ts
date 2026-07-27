// PHASE_3_EVENTS_MODULE
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceEventTablesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  tableIds!: string[];
}
