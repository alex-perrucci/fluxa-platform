import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { LocationAccessService } from '../auth/location-access.service';
import { PrintingAccessService } from './printing-access.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const deviceLocationId = '22222222-2222-4222-8222-222222222222';
const adminLocationId = '33333333-3333-4333-8333-333333333333';

const ownerAuth: AuthContext = {
  userId: '44444444-4444-4444-8444-444444444444',
  sessionId: '55555555-5555-4555-8555-555555555555',
  deviceId: '66666666-6666-4666-8666-666666666666',
  email: 'owner@example.com',
  displayName: 'Owner',
  platformAdmin: false,
  organizationId,
  membershipId: '77777777-7777-4777-8777-777777777777',
  role: 'OWNER',
};

function makeService() {
  const query = jest.fn().mockResolvedValue({
    rows: [
      {
        id: adminLocationId,
        timezone: 'Europe/Rome',
        status: 'ACTIVE',
        assignmentId: 'assignment-1',
        assignmentLocationId: deviceLocationId,
      },
    ],
  });
  const database = { pool: { query } } as unknown as DatabaseService;
  const locationAccess = {
    assert: jest.fn().mockResolvedValue({
      organizationId,
      locationId: adminLocationId,
      timezone: 'Europe/Rome',
    }),
  } as unknown as LocationAccessService;
  return {
    service: new PrintingAccessService(database, locationAccess),
    query,
    locationAccess,
  };
}

describe('PrintingAccessService context separation', () => {
  it('lets an OWNER administer an authorized location independently from the browser device assignment', async () => {
    const { service, locationAccess, query } = makeService();

    await expect(
      service.assertAdministrativeLocation(ownerAuth, adminLocationId),
    ).resolves.toMatchObject({ locationId: adminLocationId });

    expect(locationAccess.assert).toHaveBeenCalledWith(
      ownerAuth,
      adminLocationId,
      undefined,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps the operational device/location check strict', async () => {
    const { service } = makeService();

    await expect(
      service.assertLocation(ownerAuth, adminLocationId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires manage_location for manager-side printer administration', async () => {
    const { service, locationAccess } = makeService();
    const managerAuth: AuthContext = { ...ownerAuth, role: 'MANAGER' };

    await service.assertAdministrativeLocation(managerAuth, adminLocationId);

    expect(locationAccess.assert).toHaveBeenCalledWith(
      managerAuth,
      adminLocationId,
      'manage_location',
    );
  });
});
