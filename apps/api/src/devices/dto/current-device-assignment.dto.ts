import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEVICE_OPERATIONAL_STATUSES,
  type DeviceOperationalStatus,
} from '../device-assignment-status';
import { POS_OPERATOR_MODES, type PosOperatorMode } from './assign-device.dto';

export class CurrentDeviceViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  installationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['ANDROID', 'IOS', 'WINDOWS', 'WEB', 'OTHER'] })
  platform!: 'ANDROID' | 'IOS' | 'WINDOWS' | 'WEB' | 'OTHER';

  @ApiPropertyOptional({ nullable: true })
  model!: string | null;

  @ApiPropertyOptional({ nullable: true })
  appVersion!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'REVOKED'] })
  status!: 'ACTIVE' | 'REVOKED';

  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: Date;
}

export class CurrentDeviceAssignmentViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  locationId!: string | null;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ enum: POS_OPERATOR_MODES })
  operatorMode!: PosOperatorMode;

  @ApiProperty({ type: String, format: 'date-time' })
  assignedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class CurrentDeviceLocationViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
}

export class CurrentDeviceAssignmentResponseDto {
  @ApiProperty({ enum: DEVICE_OPERATIONAL_STATUSES })
  operationalStatus!: DeviceOperationalStatus;

  @ApiProperty({ type: CurrentDeviceViewDto })
  device!: CurrentDeviceViewDto;

  @ApiProperty({ type: CurrentDeviceAssignmentViewDto })
  assignment!: CurrentDeviceAssignmentViewDto;

  @ApiPropertyOptional({
    type: CurrentDeviceLocationViewDto,
    nullable: true,
  })
  location!: CurrentDeviceLocationViewDto | null;
}
