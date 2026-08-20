import { describe, expect, it } from 'vitest';
import {
  merchantLegacyDetailRoutes,
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
});
