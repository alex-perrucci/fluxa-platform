import { IsUUID } from 'class-validator';

export class PrintRouteListQueryDto {
  @IsUUID()
  locationId!: string;
}
