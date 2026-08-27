import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequiresEntitlement } from '../subscriptions/requires-entitlement.decorator';
import { KitchenConfigurationService } from './kitchen-configuration.service';

@RequiresEntitlement('KITCHEN_ROUTING')
@Controller('kitchen-station-routes')
export class KitchenConfigurationController {
  constructor(private readonly service: KitchenConfigurationService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.service.listCategoryRoutes(auth, locationId);
  }
}
