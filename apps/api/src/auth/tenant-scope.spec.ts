import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from './auth.types';
import { assertOrganizationScope } from './tenant-scope';

const context: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  deviceId: '33333333-3333-4333-8333-333333333333',
  email: 'owner@example.com',
  displayName: 'Owner',
  platformAdmin: false,
  organizationId: '44444444-4444-4444-8444-444444444444',
  membershipId: '55555555-5555-4555-8555-555555555555',
  role: 'OWNER',
};

describe('assertOrganizationScope', () => {
  it('returns the active organization', () => {
    expect(assertOrganizationScope(context)).toBe(context.organizationId);
  });

  it('blocks cross-tenant access', () => {
    expect(() =>
      assertOrganizationScope(context, '66666666-6666-4666-8666-666666666666'),
    ).toThrow(ForbiddenException);
  });

  it('requires a selected tenant', () => {
    expect(() =>
      assertOrganizationScope({
        ...context,
        organizationId: null,
        membershipId: null,
        role: null,
      }),
    ).toThrow(ForbiddenException);
  });
});
