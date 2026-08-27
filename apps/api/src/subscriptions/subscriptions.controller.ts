import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me/entitlements')
  current(@CurrentAuth() auth: AuthContext) {
    return this.subscriptions.getOrganizationEntitlements(
      assertOrganizationScope(auth),
    );
  }

  @TenantOptional()
  @PlatformAdminOnly()
  @Get('platform/organizations/:organizationId/subscription')
  platformGet(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.subscriptions.getOrganizationEntitlements(organizationId);
  }

  @TenantOptional()
  @PlatformAdminOnly()
  @Patch('platform/organizations/:organizationId/subscription')
  platformUpdate(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.setSubscription(auth, organizationId, dto);
  }
}
