import { Controller, Get, Query } from '@nestjs/common';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthContext } from '../auth/auth.types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('live')
  live() {
    return this.health.live();
  }

  @Public()
  @Get('ready')
  ready() {
    return this.health.ready();
  }

  @Get('operational')
  operational(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId') locationId?: string,
  ) {
    return this.health.operational(auth, locationId);
  }

  @PlatformAdminOnly()
  @Get('infrastructure')
  infrastructure() {
    return this.health.infrastructure();
  }
}
