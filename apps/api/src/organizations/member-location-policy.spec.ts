import { memberRoleRequiresLocation } from './member-location-policy';

describe('memberRoleRequiresLocation', () => {
  it.each(['CASHIER', 'WAITER'] as const)(
    'requires a location for %s',
    (role) => {
      expect(memberRoleRequiresLocation(role)).toBe(true);
    },
  );

  it.each([
    'OWNER',
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  ] as const)('does not force a location for %s', (role) => {
    expect(memberRoleRequiresLocation(role)).toBe(false);
  });
});
