import { describe, expect, it } from 'vitest';
import {
  merchantLegacyDetailRoutes,
  merchantMergedLegacyRoutes,
  merchantNavigation,
} from './merchant-navigation';

describe('merchantNavigation', () => {
  it('keeps the merchant sidebar focused on six task-oriented destinations', () => {
    expect(merchantNavigation.map((item) => item.label)).toEqual([
      'Home',
      'Menu',
      'Locale',
      'Operatività',
      'Vendite',
      'Impostazioni',
    ]);
    expect(merchantNavigation).toHaveLength(6);
  });

  it('does not expose legacy implementation/detail pages as first-level navigation', () => {
    const primaryRoutes = new Set(merchantNavigation.map((item) => item.href));
    for (const route of merchantLegacyDetailRoutes) {
      expect(primaryRoutes.has(route)).toBe(false);
    }
  });

  it('keeps the consolidated task hubs reachable', () => {
    expect(merchantNavigation.map((item) => item.href)).toEqual([
      '/merchant',
      '/merchant/catalog',
      '/merchant/venue',
      '/merchant/operations',
      '/merchant/sales',
      '/merchant/settings',
    ]);
  });

  it('merges duplicate configuration pages into the merchant mental model', () => {
    expect(merchantMergedLegacyRoutes).toEqual({
      '/merchant/location': '/merchant/venue',
      '/merchant/floor-plan': '/merchant/venue?view=map',
      '/merchant/kitchen-configuration': '/merchant/operations?view=printing',
      '/merchant/pos-configuration': '/merchant/operations?view=devices',
      '/merchant/fiscal-configuration': '/merchant/settings',
    });

    const canonicalRoots = new Set(merchantNavigation.map((item) => item.href));
    for (const target of Object.values(merchantMergedLegacyRoutes)) {
      expect(canonicalRoots.has(target.split('?')[0] as (typeof merchantNavigation)[number]['href'])).toBe(true);
    }
  });
});
