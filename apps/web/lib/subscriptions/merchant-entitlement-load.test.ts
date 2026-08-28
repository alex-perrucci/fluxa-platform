import { describe, expect, it } from 'vitest';
import { FluxaApiError } from '@/lib/api/fluxa-api';
import type { OrganizationEntitlements } from '@/lib/subscriptions/entitlements';
import { loadMerchantEntitlementsSafely } from './merchant-entitlement-load';

const subscription: OrganizationEntitlements = {
  plan: 'PRO',
  status: 'ACTIVE',
  startsAt: '2026-08-28T00:00:00.000Z',
  endsAt: null,
  entitlements: ['POS_CORE', 'KITCHEN', 'KITCHEN_PRINTING', 'KDS'],
  planName: 'Fluxa Pro',
  planDescription: 'Test plan',
  includedFeatures: ['Cucina'],
  upgrade: null,
};

describe('loadMerchantEntitlementsSafely', () => {
  it('returns the current subscription when the API responds', async () => {
    const result = await loadMerchantEntitlementsSafely(async () => subscription);

    expect(result).toEqual({ subscription, error: null });
  });

  it('keeps the merchant page renderable when the subscription API fails', async () => {
    const result = await loadMerchantEntitlementsSafely(async () => {
      throw new FluxaApiError(
        500,
        'SERVER_ERROR',
        'Upstream failed',
        { code: 'SERVER_ERROR' },
      );
    });

    expect(result.subscription).toBeNull();
    expect(result.error).toContain('SERVER_ERROR');
  });

  it('returns a clear message when a subscription is not provisioned', async () => {
    const result = await loadMerchantEntitlementsSafely(async () => {
      throw new FluxaApiError(
        403,
        'SUBSCRIPTION_NOT_PROVISIONED',
        'Missing subscription',
        { code: 'SUBSCRIPTION_NOT_PROVISIONED' },
      );
    });

    expect(result.subscription).toBeNull();
    expect(result.error).toContain('non risulta ancora configurato');
  });
});
