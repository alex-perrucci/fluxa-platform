// PHASE_8_TRUE_CONTROL_CENTER
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { PlatformOnboardingDto } from './dto/platform-onboarding.dto';
import { PlatformService } from './platform.service';

@TenantOptional()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

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
}
