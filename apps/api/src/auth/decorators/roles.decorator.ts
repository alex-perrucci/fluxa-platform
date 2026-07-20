import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@fluxa/database';
import { REQUIRED_ROLES_KEY } from '../auth.constants';

export const Roles = (...roles: MembershipRole[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
