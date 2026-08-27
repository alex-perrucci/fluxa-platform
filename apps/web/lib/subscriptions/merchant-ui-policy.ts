import type { Entitlement } from './entitlements';

export interface MerchantUiCapabilities {
  tables: boolean;
  floorPlan: boolean;
  kitchen: boolean;
  kitchenPrinting: boolean;
  kds: boolean;
}

export function merchantUiCapabilities(
  entitlements: readonly Entitlement[],
): MerchantUiCapabilities {
  const enabled = new Set(entitlements);
  return {
    tables:
      enabled.has('TABLES') && enabled.has('TABLE_SERVICE'),
    floorPlan: enabled.has('FLOOR_PLAN'),
    kitchen: enabled.has('KITCHEN'),
    kitchenPrinting:
      enabled.has('KITCHEN') && enabled.has('KITCHEN_PRINTING'),
    kds: enabled.has('KITCHEN') && enabled.has('KDS'),
  };
}
