import { IsIn, IsOptional, IsUUID } from 'class-validator';
export class KitchenTicketListQueryDto {
  @IsUUID() locationId!: string;
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional()
  @IsIn(['QUEUED', 'IN_PROGRESS', 'READY', 'SERVED', 'CANCELLED'])
  status?: 'QUEUED' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';
}
