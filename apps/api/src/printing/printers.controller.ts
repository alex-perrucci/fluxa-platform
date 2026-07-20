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
import { CreatePrinterDto } from './dto/create-printer.dto';
import { PrinterHeartbeatDto } from './dto/printer-heartbeat.dto';
import { PrinterListQueryDto } from './dto/printer-list-query.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';
import { PrintersService } from './printers.service';

@Controller('printers')
export class PrintersController {
  constructor(private readonly service: PrintersService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: PrinterListQueryDto) {
    return this.service.list(auth, query);
  }

  @Get(':printerId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
  ) {
    return this.service.get(auth, printerId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreatePrinterDto) {
    return this.service.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':printerId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @Body() dto: UpdatePrinterDto,
  ) {
    return this.service.update(auth, printerId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':printerId/heartbeat')
  heartbeat(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @Body() dto: PrinterHeartbeatDto,
  ) {
    return this.service.heartbeat(auth, printerId, dto);
  }
}
