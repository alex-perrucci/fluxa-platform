import { describe, expect, it } from 'vitest';
import {
  currentControlCenterLabel,
  isControlCenterNavigationActive,
} from './navigation-state';
import { merchantNavigation } from './merchant-navigation';

describe('control center navigation state', () => {
  it('keeps Home exact and marks task sections active for nested routes', () => {
    expect(isControlCenterNavigationActive('/merchant', '/merchant')).toBe(true);
    expect(isControlCenterNavigationActive('/merchant/catalog', '/merchant')).toBe(false);
    expect(
      isControlCenterNavigationActive('/merchant/catalog/products/123', '/merchant/catalog'),
    ).toBe(true);
  });

  it('ignores query strings and trailing slashes', () => {
    expect(
      isControlCenterNavigationActive(
        '/merchant/venue/?view=map',
        '/merchant/venue',
      ),
    ).toBe(true);
  });

  it('uses the active task label as the merchant page title', () => {
    expect(
      currentControlCenterLabel(
        '/merchant/operations/printing',
        merchantNavigation,
        'Gestione locale',
      ),
    ).toBe('Operatività');
    expect(
      currentControlCenterLabel('/merchant', merchantNavigation, 'Gestione locale'),
    ).toBe('Home');
  });

  it('falls back safely for non-canonical detail routes', () => {
    expect(
      currentControlCenterLabel(
        '/merchant/legacy-only-route',
        merchantNavigation,
        'Gestione locale',
      ),
    ).toBe('Gestione locale');
  });
});
