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
import { Roles } from '../auth/decorators/roles.decorator';
import { UpsertFiscalProfileDto } from './dto/upsert-fiscal-profile.dto';
import { FiscalProfilesService } from './fiscal-profiles.service';

@Controller('fiscal-profiles')
export class FiscalProfilesController {
  constructor(private readonly profiles: FiscalProfilesService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPPORT_READONLY')
  @Get(':locationId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.profiles.get(auth, locationId);
  }

  @Roles('OWNER', 'ADMIN')
  @Put(':locationId')
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpsertFiscalProfileDto,
  ) {
    return this.profiles.upsert(auth, locationId, dto);
  }
}
