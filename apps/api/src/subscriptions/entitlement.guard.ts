import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { Entitlement } from './entitlements';
import {
  REQUIRED_ENTITLEMENT_KEY,
} from './requires-entitlement.decorator';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const entitlement = this.reflector.getAllAndOverride<Entitlement>(
      REQUIRED_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!entitlement) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.auth.organizationId;
    if (!organizationId) return false;

    await this.subscriptions.assertEntitlement(organizationId, entitlement);
    return true;
  }
}
