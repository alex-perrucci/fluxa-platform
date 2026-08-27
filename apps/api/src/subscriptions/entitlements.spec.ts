import { PLAN_ENTITLEMENTS, requiredPlanForEntitlement } from './entitlements';

describe('subscription entitlement matrix', () => {
  it('keeps START on core POS capabilities only', () => {
    expect(PLAN_ENTITLEMENTS.START).toEqual(
      expect.arrayContaining([
        'POS_CORE',
        'CATALOG',
        'ORDERS',
        'PAYMENTS',
        'RECEIPT_PRINTING',
        'FISCAL',
      ]),
    );
    expect(PLAN_ENTITLEMENTS.START).not.toContain('TABLES');
    expect(PLAN_ENTITLEMENTS.START).not.toContain('KITCHEN');
  });

  it('adds table service to SALA but not kitchen', () => {
    expect(PLAN_ENTITLEMENTS.SALA).toEqual(
      expect.arrayContaining(['TABLES', 'FLOOR_PLAN', 'TABLE_SERVICE']),
    );
    expect(PLAN_ENTITLEMENTS.SALA).not.toContain('KITCHEN');
  });

  it('adds kitchen capabilities to PRO', () => {
    expect(PLAN_ENTITLEMENTS.PRO).toEqual(
      expect.arrayContaining([
        'TABLES',
        'FLOOR_PLAN',
        'TABLE_SERVICE',
        'KITCHEN',
        'KITCHEN_ROUTING',
        'KITCHEN_PRINTING',
        'KDS',
      ]),
    );
  });

  it('resolves the minimum plan for protected capabilities', () => {
    expect(requiredPlanForEntitlement('TABLES')).toBe('SALA');
    expect(requiredPlanForEntitlement('KITCHEN')).toBe('PRO');
    expect(requiredPlanForEntitlement('FISCAL')).toBe('START');
  });
});
