import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { AssignDeviceDto } from './dto/assign-device.dto';
import { UpdateCurrentDeviceDto } from './dto/update-current-device.dto';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @TenantOptional()
  @Get('me')
  current(@CurrentAuth() auth: AuthContext) {
    return this.devicesService.current(auth);
  }

  @TenantOptional()
  @Patch('me')
  updateCurrent(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateCurrentDeviceDto,
  ) {
    return this.devicesService.updateCurrent(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.devicesService.list(auth);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':deviceId/assignment')
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: AssignDeviceDto,
  ) {
    return this.devicesService.assign(auth, deviceId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':deviceId/assignment')
  revokeAssignment(
    @CurrentAuth() auth: AuthContext,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devicesService.revokeAssignment(auth, deviceId);
  }
}
