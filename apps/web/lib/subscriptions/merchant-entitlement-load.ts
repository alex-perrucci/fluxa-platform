import { FluxaApiError } from '@/lib/api/fluxa-api';
import {
  getMerchantEntitlements,
  type OrganizationEntitlements,
} from '@/lib/subscriptions/entitlements';

export type MerchantEntitlementLoadResult = {
  subscription: OrganizationEntitlements | null;
  error: string | null;
};

type EntitlementFetcher = () => Promise<OrganizationEntitlements>;

export async function loadMerchantEntitlementsSafely(
  fetcher: EntitlementFetcher = getMerchantEntitlements,
): Promise<MerchantEntitlementLoadResult> {
  try {
    return {
      subscription: await fetcher(),
      error: null,
    };
  } catch (error) {
    return {
      subscription: null,
      error: entitlementLoadErrorMessage(error),
    };
  }
}

export function entitlementLoadErrorMessage(error: unknown): string {
  if (error instanceof FluxaApiError) {
    switch (error.code) {
      case 'SUBSCRIPTION_NOT_PROVISIONED':
        return 'Il piano Fluxa del locale non risulta ancora configurato.';
      case 'SUBSCRIPTION_SUSPENDED':
        return 'La subscription Fluxa risulta sospesa.';
      default:
        return `Non siamo riusciti a verificare il piano Fluxa (${error.code}).`;
    }
  }

  return 'Non siamo riusciti a verificare il piano Fluxa. Riprova tra poco.';
}
