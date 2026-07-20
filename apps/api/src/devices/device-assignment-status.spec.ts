import { resolveDeviceOperationalStatus } from './device-assignment-status';

describe('resolveDeviceOperationalStatus', () => {
  it('marks a valid active location as READY', () => {
    expect(
      resolveDeviceOperationalStatus({
        assignmentActive: true,
        locationId: '11111111-1111-4111-8111-111111111111',
        locationStatus: 'ACTIVE',
      }),
    ).toBe('READY');
  });

  it('requires a location when the organization assignment has no location', () => {
    expect(
      resolveDeviceOperationalStatus({
        assignmentActive: true,
        locationId: null,
        locationStatus: null,
      }),
    ).toBe('LOCATION_REQUIRED');
  });

  it('reports a revoked assignment before evaluating the location', () => {
    expect(
      resolveDeviceOperationalStatus({
        assignmentActive: false,
        locationId: '11111111-1111-4111-8111-111111111111',
        locationStatus: 'ACTIVE',
      }),
    ).toBe('ASSIGNMENT_REVOKED');
  });

  it('reports an inactive location', () => {
    expect(
      resolveDeviceOperationalStatus({
        assignmentActive: true,
        locationId: '11111111-1111-4111-8111-111111111111',
        locationStatus: 'INACTIVE',
      }),
    ).toBe('LOCATION_INACTIVE');
  });

  it('treats a missing location row as inactive when locationId is present', () => {
    expect(
      resolveDeviceOperationalStatus({
        assignmentActive: true,
        locationId: '11111111-1111-4111-8111-111111111111',
        locationStatus: null,
      }),
    ).toBe('LOCATION_INACTIVE');
  });
});
