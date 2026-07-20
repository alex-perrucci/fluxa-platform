import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { CurrentDeviceAssignmentService } from './current-device-assignment.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const locationId = '55555555-5555-4555-8555-555555555555';

const auth: AuthContext = {
  userId,
  sessionId: '66666666-6666-4666-8666-666666666666',
  deviceId,
  email: 'cashier@example.com',
  displayName: 'Cashier',
  platformAdmin: false,
  organizationId,
  membershipId: '77777777-7777-4777-8777-777777777777',
  role: 'CASHIER',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    deviceId,
    installationId: 'installation-1',
    deviceName: 'POS 1',
    platform: 'WINDOWS',
    model: 'Surface',
    appVersion: '1.0.0',
    deviceStatus: 'ACTIVE',
    lastSeenAt: new Date('2026-07-21T10:00:00.000Z'),
    assignmentId,
    assignmentLocationId: locationId,
    assignmentActive: true,
    assignedAt: new Date('2026-07-20T10:00:00.000Z'),
    revokedAt: null,
    assignmentUpdatedAt: new Date('2026-07-20T10:00:00.000Z'),
    locationRecordId: locationId,
    locationCode: 'PARMA',
    locationName: 'Parma Centro',
    locationTimezone: 'Europe/Rome',
    locationStatus: 'ACTIVE',
    ...overrides,
  };
}

function serviceWithRows(rows: Record<string, unknown>[]) {
  const query = jest.fn().mockResolvedValue({ rows });
  const database = { pool: { query } } as unknown as DatabaseService;
  return { service: new CurrentDeviceAssignmentService(database), query };
}

function exceptionCode(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('getResponse' in error)
  ) {
    return undefined;
  }

  const response = (error as { getResponse(): unknown }).getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

async function expectRejectCode(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected rejection with code ${expectedCode}.`);
  } catch (error) {
    expect(exceptionCode(error)).toBe(expectedCode);
  }
}

describe('CurrentDeviceAssignmentService', () => {
  it('returns READY for the current CASHIER device and active tenant location', async () => {
    const { service, query } = serviceWithRows([row()]);

    const result = await service.get(auth);

    expect(result.operationalStatus).toBe('READY');
    expect(result.assignment.organizationId).toBe(organizationId);
    expect(result.location?.id).toBe(locationId);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      deviceId,
      userId,
      organizationId,
    ]);
  });

  it('supports WAITER without requiring an administrative role', async () => {
    const { service } = serviceWithRows([row()]);
    const result = await service.get({ ...auth, role: 'WAITER' });
    expect(result.operationalStatus).toBe('READY');
  });

  it('returns LOCATION_REQUIRED when the tenant assignment has no location', async () => {
    const { service } = serviceWithRows([
      row({
        assignmentLocationId: null,
        locationRecordId: null,
        locationCode: null,
        locationName: null,
        locationTimezone: null,
        locationStatus: null,
      }),
    ]);

    const result = await service.get(auth);
    expect(result.operationalStatus).toBe('LOCATION_REQUIRED');
    expect(result.location).toBeNull();
  });

  it('returns ASSIGNMENT_REVOKED for an inactive assignment', async () => {
    const { service } = serviceWithRows([
      row({ assignmentActive: false, revokedAt: new Date() }),
    ]);
    expect((await service.get(auth)).operationalStatus).toBe(
      'ASSIGNMENT_REVOKED',
    );
  });

  it('returns LOCATION_INACTIVE for inactive or missing location rows', async () => {
    const inactive = serviceWithRows([row({ locationStatus: 'INACTIVE' })]);
    expect((await inactive.service.get(auth)).operationalStatus).toBe(
      'LOCATION_INACTIVE',
    );

    const missing = serviceWithRows([
      row({
        locationRecordId: null,
        locationCode: null,
        locationName: null,
        locationTimezone: null,
        locationStatus: null,
      }),
    ]);
    expect((await missing.service.get(auth)).operationalStatus).toBe(
      'LOCATION_INACTIVE',
    );
  });

  it('does not expose another user device or a missing device', async () => {
    const { service } = serviceWithRows([]);
    await expect(service.get(auth)).rejects.toBeInstanceOf(NotFoundException);
    await expectRejectCode(service.get(auth), 'DEVICE_NOT_FOUND');
  });

  it('returns a stable error when no assignment exists for the active tenant', async () => {
    const { service } = serviceWithRows([
      row({
        assignmentId: null,
        assignmentLocationId: null,
        assignmentActive: null,
        assignedAt: null,
        assignmentUpdatedAt: null,
        locationRecordId: null,
        locationCode: null,
        locationName: null,
        locationTimezone: null,
        locationStatus: null,
      }),
    ]);

    await expect(service.get(auth)).rejects.toBeInstanceOf(NotFoundException);
    await expectRejectCode(service.get(auth), 'DEVICE_ASSIGNMENT_NOT_FOUND');
  });

  it('requires an active tenant context', async () => {
    const { service } = serviceWithRows([]);
    await expect(
      service.get({
        ...auth,
        organizationId: null,
        membershipId: null,
        role: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
