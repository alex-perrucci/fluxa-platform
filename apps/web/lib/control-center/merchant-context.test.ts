import { describe, expect, it } from 'vitest';
import { resolveAdministrativeLocation } from './merchant-context';

const locations = [
  { id: 'location-a', status: 'ACTIVE' },
  { id: 'location-b', status: 'ACTIVE' },
];

describe('resolveAdministrativeLocation', () => {
  it('uses an explicitly requested authorized location before the membership default', () => {
    expect(
      resolveAdministrativeLocation({
        locations,
        requestedLocationId: 'location-b',
        defaultLocationId: 'location-a',
      })?.id,
    ).toBe('location-b');
  });

  it('does not trust a defaultLocationId that is outside the authorized list', () => {
    expect(
      resolveAdministrativeLocation({
        locations,
        defaultLocationId: 'other-tenant-location',
      })?.id,
    ).toBe('location-a');
  });

  it('returns null for an organization without locations', () => {
    expect(resolveAdministrativeLocation({ locations: [] })).toBeNull();
  });
});
