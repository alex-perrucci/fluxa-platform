import { describe, expect, it } from 'vitest';
import type { Entitlement } from './entitlements';
import { merchantUiCapabilities } from './merchant-ui-policy';

const start: Entitlement[] = [
  'POS_CORE',
  'CATALOG',
  'ORDERS',
  'PAYMENTS',
  'RECEIPT_PRINTING',
  'FISCAL',
];
const sala: Entitlement[] = [
  ...start,
  'TABLES',
  'FLOOR_PLAN',
  'TABLE_SERVICE',
];
const pro: Entitlement[] = [
  ...sala,
  'KITCHEN',
  'KITCHEN_ROUTING',
  'KITCHEN_PRINTING',
  'KDS',
];

describe('merchantUiCapabilities', () => {
  it('START exposes base operations only', () => {
    expect(merchantUiCapabilities(start)).toEqual({
      tables: false,
      floorPlan: false,
      kitchen: false,
      kitchenPrinting: false,
      kds: false,
    });
  });

  it('SALA exposes table and floor plan UI without kitchen', () => {
    expect(merchantUiCapabilities(sala)).toEqual({
      tables: true,
      floorPlan: true,
      kitchen: false,
      kitchenPrinting: false,
      kds: false,
    });
  });

  it('PRO exposes the complete hospitality UI', () => {
    expect(merchantUiCapabilities(pro)).toEqual({
      tables: true,
      floorPlan: true,
      kitchen: true,
      kitchenPrinting: true,
      kds: true,
    });
  });

  it('fails closed if one capability of a composed feature is missing', () => {
    expect(merchantUiCapabilities(['TABLES'])).toMatchObject({ tables: false });
    expect(merchantUiCapabilities(['KITCHEN'])).toMatchObject({
      kitchenPrinting: false,
      kds: false,
    });
  });
});
