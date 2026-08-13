import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { PlatformOpenApiFiscalProfileDto } from './dto/platform-openapi-fiscal-profile.dto';
import { PlatformOpenApiFiscalService } from './platform-openapi-fiscal.service';

@TenantOptional()
@PlatformAdminOnly()
@Controller(
  'platform/organizations/:organizationId/locations/:locationId/openapi-fiscal-profile',
)
export class PlatformOpenApiFiscalController {
  constructor(private readonly openApiFiscal: PlatformOpenApiFiscalService) {}

  @Get()
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.openApiFiscal.get(organizationId, locationId);
  }

  @Put()
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PlatformOpenApiFiscalProfileDto,
  ) {
    return this.openApiFiscal.upsert(auth, organizationId, locationId, dto);
  }
}
