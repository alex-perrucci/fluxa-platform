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
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';
import { KitchenService } from './kitchen.service';
@Controller('kitchen-stations')
export class KitchenStationsController {
  constructor(private readonly service: KitchenService) {}
  @Get() list(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.service.listStations(auth, locationId);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Post() create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateKitchenStationDto,
  ) {
    return this.service.createStation(auth, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Patch(':stationId') update(
    @CurrentAuth() auth: AuthContext,
    @Param('stationId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKitchenStationDto,
  ) {
    return this.service.updateStation(auth, id, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':stationId/categories/:categoryId')
  route(
    @CurrentAuth() auth: AuthContext,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.service.routeCategory(auth, stationId, categoryId);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':stationId/categories/:categoryId')
  unroute(
    @CurrentAuth() auth: AuthContext,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.service.unrouteCategory(auth, stationId, categoryId);
  }
}
