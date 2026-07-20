import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from './auth.types';

export function assertOrganizationScope(
  auth: AuthContext,
  requestedOrganizationId?: string,
): string {
  if (!auth.organizationId || !auth.membershipId || !auth.role) {
    throw new ForbiddenException({
      code: 'TENANT_CONTEXT_REQUIRED',
      message: "Seleziona un'organizzazione prima di usare questa risorsa.",
    });
  }

  if (
    requestedOrganizationId &&
    requestedOrganizationId !== auth.organizationId
  ) {
    throw new ForbiddenException({
      code: 'CROSS_TENANT_ACCESS_DENIED',
      message: "La risorsa appartiene a un'altra organizzazione.",
    });
  }

  return auth.organizationId;
}
