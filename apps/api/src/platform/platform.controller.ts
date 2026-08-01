// PHASE_8_TRUE_CONTROL_CENTER
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { PlatformOnboardingDto } from './dto/platform-onboarding.dto';
import { PlatformTableLayoutDto } from './dto/platform-table-layout.dto';
import { PlatformService } from './platform.service';
import { PlatformTableLayoutService } from './platform-table-layout.service';

@TenantOptional()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly tableLayouts: PlatformTableLayoutService,
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
