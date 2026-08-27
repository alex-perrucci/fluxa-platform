import { SetMetadata } from '@nestjs/common';
import type { Entitlement } from './entitlements';

export const REQUIRED_ENTITLEMENT_KEY = 'fluxa:required-entitlement';

export const RequiresEntitlement = (entitlement: Entitlement) =>
  SetMetadata(REQUIRED_ENTITLEMENT_KEY, entitlement);
