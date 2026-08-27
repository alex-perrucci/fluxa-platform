import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementGuard } from './entitlement.guard';
import { SubscriptionsService } from './subscriptions.service';

describe('EntitlementGuard', () => {
  function context(organizationId: string | null): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            userId: '00000000-0000-4000-8000-000000000001',
            organizationId,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows routes without an entitlement requirement', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const subscriptions = {
      assertEntitlement: jest.fn(),
    } as unknown as SubscriptionsService;

    const guard = new EntitlementGuard(reflector, subscriptions);

    await expect(guard.canActivate(context('org'))).resolves.toBe(true);
    expect(subscriptions.assertEntitlement).not.toHaveBeenCalled();
  });

  it('fails closed when a protected route has no tenant context', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('KITCHEN'),
    } as unknown as Reflector;
    const subscriptions = {
      assertEntitlement: jest.fn(),
    } as unknown as SubscriptionsService;

    const guard = new EntitlementGuard(reflector, subscriptions);

    await expect(guard.canActivate(context(null))).resolves.toBe(false);
  });

  it('propagates a 403 when the tenant lacks the protected capability', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('KITCHEN'),
    } as unknown as Reflector;
    const subscriptions = {
      assertEntitlement: jest.fn().mockRejectedValue(
        new ForbiddenException({
          code: 'FEATURE_NOT_INCLUDED',
          feature: 'KITCHEN',
          requiredPlan: 'PRO',
        }),
      ),
    } as unknown as SubscriptionsService;

    const guard = new EntitlementGuard(reflector, subscriptions);

    await expect(guard.canActivate(context('org'))).rejects.toMatchObject({
      status: 403,
    });
    expect(subscriptions.assertEntitlement).toHaveBeenCalledWith(
      'org',
      'KITCHEN',
    );
  });
});
