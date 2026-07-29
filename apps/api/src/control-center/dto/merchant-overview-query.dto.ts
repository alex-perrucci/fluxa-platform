// PHASE_8_TRUE_CONTROL_CENTER
import { IsUUID } from 'class-validator';

export class MerchantOverviewQueryDto {
  @IsUUID()
  locationId!: string;
}
