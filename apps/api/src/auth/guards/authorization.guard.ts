import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@fluxa/database';
import {
  IS_PUBLIC_KEY,
  PLATFORM_ADMIN_ONLY_KEY,
  REQUIRED_ROLES_KEY,
} from '../auth.constants';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    const platformAdminOnly = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (platformAdminOnly && !auth.platformAdmin) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_REQUIRED',
        message: 'Questa operazione è riservata agli amministratori Fluxa.',
      });
    }

    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      requiredRoles?.length &&
      (!auth.role || !requiredRoles.includes(auth.role))
    ) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Il ruolo corrente non consente questa operazione.',
      });
    }

    return true;
  }
}
