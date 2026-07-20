import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDiningAreaDto } from './dto/create-dining-area.dto';
import { UpdateDiningAreaDto } from './dto/update-dining-area.dto';
import { HospitalityService } from './hospitality.service';
@Controller('dining-areas')
export class DiningAreasController {
  constructor(private readonly service: HospitalityService) {}
  @Get() list(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.service.listAreas(auth, locationId);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Post(':locationId') create(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateDiningAreaDto,
  ) {
    return this.service.createArea(auth, locationId, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Patch(':areaId') update(
    @CurrentAuth() auth: AuthContext,
    @Param('areaId', ParseUUIDPipe) areaId: string,
    @Body() dto: UpdateDiningAreaDto,
  ) {
    return this.service.updateArea(auth, areaId, dto);
  }
}
