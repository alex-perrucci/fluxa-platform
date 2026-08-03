import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { MerchantDashboardService } from './merchant-dashboard.service';

const auth: AuthContext = {
  userId: '10000000-0000-4000-8000-000000000001',
  sessionId: '10000000-0000-4000-8000-000000000002',
  deviceId: '10000000-0000-4000-8000-000000000003',
  email: 'manager@fluxa.test',
  displayName: 'Manager',
  platformAdmin: false,
  organizationId: '10000000-0000-4000-8000-000000000004',
  membershipId: '10000000-0000-4000-8000-000000000005',
  role: 'MANAGER',
};

const locations = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Centro',
    timezone: 'Europe/Rome',
    city: 'Parma',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Fiera',
    timezone: 'Europe/Rome',
    city: 'Parma',
  },
];

describe('MerchantDashboardService', () => {
  it('aggregates only locations assigned to a multi-location manager', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: locations })
      .mockResolvedValueOnce({
        rows: [
          {
            events: 3,
            publishedEvents: 2,
            upcomingEvents: 1,
            reservations: 8,
            confirmedGuests: 16,
            refundPending: 0,
            bookingDepositsCents: '8000',
            posOrders: 12,
            posSalesCents: '24500',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const database = { pool: { query } };
    const locationAccess = { assert: jest.fn() };
    const service = new MerchantDashboardService(
      database as never,
      locationAccess as never,
    );

    const result = await service.overview(auth);

    expect(result.scope.kind).toBe('ALL');
    expect(result.scope.locations).toEqual(locations);
    expect(result.metrics.posSalesCents).toBe('24500');
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('organization_membership_locations'),
      [auth.organizationId, auth.membershipId, false],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('location_id=ANY($2::uuid[])'),
      [auth.organizationId, locations.map((location) => location.id)],
    );
    expect(locationAccess.assert).not.toHaveBeenCalled();
  });

  it('rejects a selected location outside the manager assignment scope', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: locations });
    const locationAccess = {
      assert: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException({ code: 'LOCATION_ACCESS_DENIED' }),
        ),
    };
    const service = new MerchantDashboardService(
      { pool: { query } } as never,
      locationAccess as never,
    );
    const forbiddenLocationId = '30000000-0000-4000-8000-000000000001';

    await expect(service.overview(auth, forbiddenLocationId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(locationAccess.assert).toHaveBeenCalledWith(
      auth,
      forbiddenLocationId,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
