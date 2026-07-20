export const DEVICE_OPERATIONAL_STATUSES = [
  'LOCATION_REQUIRED',
  'READY',
  'ASSIGNMENT_REVOKED',
  'LOCATION_INACTIVE',
] as const;

export type DeviceOperationalStatus =
  (typeof DEVICE_OPERATIONAL_STATUSES)[number];

export interface DeviceAssignmentOperationalInput {
  assignmentActive: boolean;
  locationId: string | null;
  locationStatus: 'ACTIVE' | 'INACTIVE' | null;
}

export function resolveDeviceOperationalStatus(
  input: DeviceAssignmentOperationalInput,
): DeviceOperationalStatus {
  if (!input.assignmentActive) return 'ASSIGNMENT_REVOKED';
  if (!input.locationId) return 'LOCATION_REQUIRED';
  if (input.locationStatus !== 'ACTIVE') return 'LOCATION_INACTIVE';
  return 'READY';
}
