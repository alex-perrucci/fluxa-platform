import { SetMetadata } from '@nestjs/common';
import { PLATFORM_ADMIN_ONLY_KEY } from '../auth.constants';

export const PlatformAdminOnly = () =>
  SetMetadata(PLATFORM_ADMIN_ONLY_KEY, true);
