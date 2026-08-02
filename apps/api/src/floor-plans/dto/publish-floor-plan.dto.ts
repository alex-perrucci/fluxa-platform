import { IsInt, Min } from 'class-validator';

export class PublishFloorPlanDto {
  @IsInt()
  @Min(1)
  revision!: number;
}
