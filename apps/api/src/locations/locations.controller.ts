import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.locationsService.list(auth);
  }

  @Get(':locationId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.locationsService.get(auth, locationId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':locationId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(auth, locationId, dto);
  }
}
