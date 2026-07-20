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
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { CurrentDeviceAssignmentService } from './current-device-assignment.service';
import { AssignDeviceDto } from './dto/assign-device.dto';
import { CurrentDeviceAssignmentResponseDto } from './dto/current-device-assignment.dto';
import { UpdateCurrentDeviceDto } from './dto/update-current-device.dto';
import { DevicesService } from './devices.service';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly currentDeviceAssignment: CurrentDeviceAssignmentService,
  ) {}

  @TenantOptional()
  @Get('me')
  current(@CurrentAuth() auth: AuthContext) {
    return this.devicesService.current(auth);
  }

  @Get('me/assignment')
  @ApiOperation({
    summary: 'Recupera il contesto operativo del dispositivo corrente',
  })
  @ApiOkResponse({ type: CurrentDeviceAssignmentResponseDto })
  @ApiForbiddenResponse({
    description: 'TENANT_CONTEXT_REQUIRED: nessuna organizzazione attiva.',
  })
  @ApiNotFoundResponse({
    description:
      'DEVICE_NOT_FOUND oppure DEVICE_ASSIGNMENT_NOT_FOUND per il tenant corrente.',
  })
  assignment(@CurrentAuth() auth: AuthContext) {
    return this.currentDeviceAssignment.get(auth);
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
