import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const POS_OPERATOR_MODES = [
  'AUTO',
  'CASHIER',
  'KITCHEN',
  'MANAGER',
] as const;

export type PosOperatorMode = (typeof POS_OPERATOR_MODES)[number];

export class AssignDeviceDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn(POS_OPERATOR_MODES)
  operatorMode?: PosOperatorMode;
}
