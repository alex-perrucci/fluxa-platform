import { SetMetadata } from '@nestjs/common';
import { TENANT_OPTIONAL_KEY } from '../auth.constants';

export const TenantOptional = () => SetMetadata(TENANT_OPTIONAL_KEY, true);
