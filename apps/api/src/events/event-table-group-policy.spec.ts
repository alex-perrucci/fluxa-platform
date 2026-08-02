import { ConflictException } from '@nestjs/common';
import {
  assertEventInventoryMutable,
  assertTablesNotAssigned,
} from './event-table-group-policy';

describe('event table group policy', () => {
  it.each(['DRAFT', 'PUBLISHED', 'SOLD_OUT'] as const)(
    'allows inventory changes for %s events',
    (status) => {
      expect(() => assertEventInventoryMutable(status)).not.toThrow();
    },
  );

  it.each(['CANCELLED', 'COMPLETED', 'ARCHIVED'] as const)(
    'locks inventory for %s events',
    (status) => {
      expect(() => assertEventInventoryMutable(status)).toThrow(
        ConflictException,
      );
    },
  );

  it('allows merge and split when no assignment is active', () => {
    expect(() => assertTablesNotAssigned(0)).not.toThrow();
  });

  it('rejects merge and split when a hold or reservation is active', () => {
    expect(() => assertTablesNotAssigned(1)).toThrow(ConflictException);
  });
});
