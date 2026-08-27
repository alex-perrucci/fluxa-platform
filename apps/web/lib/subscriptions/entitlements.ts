import { authenticatedFluxaFetch } from '@/lib/api/authenticated';

export type SubscriptionPlan = 'START' | 'SALA' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED';

export type Entitlement =
  | 'POS_CORE'
  | 'CATALOG'
  | 'ORDERS'
  | 'PAYMENTS'
  | 'RECEIPT_PRINTING'
  | 'FISCAL'
  | 'TABLES'
  | 'FLOOR_PLAN'
  | 'TABLE_SERVICE'
  | 'KITCHEN'
  | 'KITCHEN_ROUTING'
  | 'KITCHEN_PRINTING'
  | 'KDS';

export interface OrganizationEntitlements {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
  entitlements: Entitlement[];
  planName: string;
  planDescription: string;
  includedFeatures: string[];
  upgrade: {
    plan: SubscriptionPlan;
    planName: string;
    features: string[];
  } | null;
}

export function hasEntitlement(
  subscription: OrganizationEntitlements,
  entitlement: Entitlement,
) {
  return subscription.entitlements.includes(entitlement);
}

export function getMerchantEntitlements() {
  return authenticatedFluxaFetch<OrganizationEntitlements>('/me/entitlements');
}
