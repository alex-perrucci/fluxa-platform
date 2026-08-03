// PHASE_8_TRUE_CONTROL_CENTER
import { IsOptional, IsUUID } from 'class-validator';

export class MerchantOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
