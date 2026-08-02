import { IsInt, IsObject, Min } from 'class-validator';

export class SaveFloorPlanDraftDto {
  @IsInt()
  @Min(1)
  revision!: number;

  @IsObject()
  document!: Record<string, unknown>;
}
