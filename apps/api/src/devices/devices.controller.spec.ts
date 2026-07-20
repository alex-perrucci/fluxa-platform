import 'reflect-metadata';
import {
  REQUIRED_ROLES_KEY,
  TENANT_OPTIONAL_KEY,
} from '../auth/auth.constants';
import type { AuthContext } from '../auth/auth.types';
import type { CurrentDeviceAssignmentService } from './current-device-assignment.service';
import { DevicesController } from './devices.controller';
import type { DevicesService } from './devices.service';

const auth: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  deviceId: '33333333-3333-4333-8333-333333333333',
  email: 'cashier@example.com',
  displayName: 'Cashier',
  platformAdmin: false,
  organizationId: '44444444-4444-4444-8444-444444444444',
  membershipId: '55555555-5555-4555-8555-555555555555',
  role: 'CASHIER',
};

function assignmentHandler(): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    DevicesController.prototype,
    'assignment',
  );

  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('DevicesController.assignment handler not found.');
  }

  return descriptor.value as object;
}

describe('DevicesController.assignment', () => {
  it('does not require an administrative role', () => {
    expect(Reflect.hasMetadata(REQUIRED_ROLES_KEY, assignmentHandler())).toBe(
      false,
    );
  });

  it('requires an active tenant context', () => {
    expect(Reflect.hasMetadata(TENANT_OPTIONAL_KEY, assignmentHandler())).toBe(
      false,
    );
  });

  it('delegates CASHIER and WAITER contexts without accepting a deviceId', async () => {
    const get = jest.fn(() => Promise.resolve({ ok: true }));
    const controller = new DevicesController(
      {} as DevicesService,
      { get } as unknown as CurrentDeviceAssignmentService,
    );

    await controller.assignment(auth);
    await controller.assignment({ ...auth, role: 'WAITER' });

    expect(get).toHaveBeenNthCalledWith(1, auth);
    expect(get).toHaveBeenNthCalledWith(2, {
      ...auth,
      role: 'WAITER',
    });
  });
});
