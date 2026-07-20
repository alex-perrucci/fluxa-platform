import { IsOptional, IsUUID } from 'class-validator';

export class AssignDeviceDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
