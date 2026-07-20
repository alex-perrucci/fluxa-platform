import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, TENANT_OPTIONAL_KEY } from '../auth.constants';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const tenantOptional = this.reflector.getAllAndOverride<boolean>(
      TENANT_OPTIONAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (tenantOptional) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    if (!auth?.organizationId || !auth.membershipId || !auth.role) {
      throw new ForbiddenException({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: "Seleziona un'organizzazione prima di usare questa risorsa.",
      });
    }

    return true;
  }
}
