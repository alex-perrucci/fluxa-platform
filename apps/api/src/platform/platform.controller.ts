// PHASE_8_TRUE_CONTROL_CENTER
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { ReplacePlatformLocationAccessDto } from './dto/platform-location-access.dto';
import {
  CreatePlatformLocationDto,
  PlatformLocationLifecycleDto,
  UpdatePlatformLocationDto,
} from './dto/platform-location.dto';
import { PlatformOnboardingDto } from './dto/platform-onboarding.dto';
import { PlatformTableLayoutDto } from './dto/platform-table-layout.dto';
import { PlatformLocationAccessService } from './platform-location-access.service';
import { PlatformLocationsService } from './platform-locations.service';
import { PlatformService } from './platform.service';
import { PlatformTableLayoutService } from './platform-table-layout.service';

@TenantOptional()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly tableLayouts: PlatformTableLayoutService,
    private readonly locations: PlatformLocationsService,
    private readonly locationAccess: PlatformLocationAccessService,
  ) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Post('onboarding')
  onboard(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PlatformOnboardingDto,
  ) {
    return this.platform.onboard(auth, dto);
  }

  @Get('organizations/:organizationId')
  organization(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.platform.organizationSummary(organizationId);
  }

  @Get('organizations/:organizationId/locations')
  listLocations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.locations.list(organizationId);
  }

  @Post('organizations/:organizationId/locations')
  createLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreatePlatformLocationDto,
  ) {
    return this.locations.create(auth, organizationId, dto);
  }

  @Patch('organizations/:organizationId/locations/:locationId')
  updateLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdatePlatformLocationDto,
  ) {
    return this.locations.update(auth, organizationId, locationId, dto);
  }

  @Put('organizations/:organizationId/locations/:locationId/lifecycle')
  setLocationLifecycle(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PlatformLocationLifecycleDto,
  ) {
    return this.locations.setActive(
      auth,
      organizationId,
      locationId,
      dto.status,
    );
  }

  @Delete('organizations/:organizationId/locations/:locationId')
  archiveLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.locations.archive(auth, organizationId, locationId);
  }

  @Get('organizations/:organizationId/members/:membershipId/location-access')
  memberLocationAccess(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.locationAccess.list(organizationId, membershipId);
  }

  @Put('organizations/:organizationId/members/:membershipId/location-access')
  replaceMemberLocationAccess(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ReplacePlatformLocationAccessDto,
  ) {
    return this.locationAccess.replace(
      auth,
      organizationId,
      membershipId,
      dto,
    );
  }

  @Get('organizations/:organizationId/table-layout')
  tableLayout(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.tableLayouts.get(organizationId, locationId);
  }

  @Put('organizations/:organizationId/table-layout')
  replaceTableLayout(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: PlatformTableLayoutDto,
  ) {
    return this.tableLayouts.replace(auth, organizationId, dto);
  }
}
