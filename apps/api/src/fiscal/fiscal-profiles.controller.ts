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
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { UpsertFiscalProfileDto } from './dto/upsert-fiscal-profile.dto';
import { FiscalProfilesService } from './fiscal-profiles.service';

@Controller('fiscal-profiles')
export class FiscalProfilesController {
  constructor(private readonly profiles: FiscalProfilesService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPPORT_READONLY')
  @Get(':locationId')
  getMerchantStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.profiles.getMerchantStatus(auth, locationId);
  }
}

@TenantOptional()
@PlatformAdminOnly()
@Controller(
  'platform/organizations/:organizationId/locations/:locationId/fiscal-profile',
)
export class PlatformFiscalProfilesController {
  constructor(private readonly profiles: FiscalProfilesService) {}

  @Get()
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.profiles.getForPlatform(organizationId, locationId);
  }

  @Put()
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpsertFiscalProfileDto,
  ) {
    return this.profiles.upsertForPlatform(
      auth,
      organizationId,
      locationId,
      dto,
    );
  }
}
