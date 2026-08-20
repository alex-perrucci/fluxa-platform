import 'reflect-metadata';
import type { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { PLATFORM_ADMIN_ONLY_KEY } from '../auth/auth.constants';
import type { LocationAccessService } from '../auth/location-access.service';
import {
  FiscalProfilesController,
  PlatformFiscalProfilesController,
} from './fiscal-profiles.controller';
import { FiscalProfilesService } from './fiscal-profiles.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';

const ownerAuth: AuthContext = {
  userId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  deviceId: '55555555-5555-4555-8555-555555555555',
  email: 'owner@example.com',
  displayName: 'Owner',
  platformAdmin: false,
  organizationId,
  membershipId: '66666666-6666-4666-8666-666666666666',
  role: 'OWNER',
};

function makeService(query: jest.Mock) {
  const database = { pool: { query } } as unknown as DatabaseService;
  const locationAccess = {
    assert: jest.fn().mockResolvedValue({
      organizationId,
      locationId,
      timezone: 'Europe/Rome',
    }),
  } as unknown as LocationAccessService;
  return {
    service: new FiscalProfilesService(database, locationAccess),
    locationAccess,
  };
}

describe('FiscalProfilesService merchant/platform separation', () => {
  it('returns a sanitized merchant status through administrative location access', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'profile-1',
            organizationId,
            locationId,
            provider: 'ADE_WEB',
            environment: 'PRODUCTION',
            fiscalId: '12345678901',
            enabled: true,
            autoIssueOnPaid: true,
            receiptEmail: 'secret@example.com',
            displayName: 'Bar',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'document-1',
            status: 'ISSUED',
            totalCents: 130,
            createdAt: new Date('2026-08-20T14:33:00.000Z'),
            issuedAt: new Date('2026-08-20T14:33:02.000Z'),
          },
        ],
      });
    const { service, locationAccess } = makeService(query);

    const result = await service.getMerchantStatus(ownerAuth, locationId);

    expect(locationAccess.assert).toHaveBeenCalledWith(ownerAuth, locationId);
    expect(result).toMatchObject({
      locationId,
      state: 'ACTIVE',
      mode: 'Agenzia delle Entrate',
      autoIssueOnPaid: true,
      lastDocument: { status: 'ISSUED', totalCents: 130 },
    });
    expect(result).not.toHaveProperty('provider');
    expect(result).not.toHaveProperty('environment');
    expect(result).not.toHaveProperty('fiscalId');
    expect(result).not.toHaveProperty('receiptEmail');
  });

  it('keeps the merchant controller read-only and marks the platform controller as platform-admin-only', () => {
    expect(
      (FiscalProfilesController.prototype as unknown as { upsert?: unknown })
        .upsert,
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        PLATFORM_ADMIN_ONLY_KEY,
        PlatformFiscalProfilesController,
      ),
    ).toBe(true);
  });
});
