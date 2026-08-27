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
import { assertOrganizationScope } from '../auth/tenant-scope';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { PrinterHeartbeatDto } from './dto/printer-heartbeat.dto';
import { PrinterListQueryDto } from './dto/printer-list-query.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';
import { PrintersService } from './printers.service';

@Controller('printers')
export class PrintersController {
  constructor(
    private readonly service: PrintersService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PrinterListQueryDto,
  ) {
    const result = await this.service.list(auth, query);
    const canUseKitchenPrinting = await this.subscriptions.hasEntitlement(
      assertOrganizationScope(auth),
      'KITCHEN_PRINTING',
    );
    return canUseKitchenPrinting
      ? result
      : {
          ...result,
          items: result.items.filter(
            (printer) => printer.purpose !== 'KITCHEN',
          ),
        };
  }

  @Get(':printerId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
  ) {
    const printer = await this.service.get(auth, printerId);
    await this.assertKitchenPrinter(auth, printer.purpose);
    return printer;
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePrinterDto,
  ) {
    await this.assertKitchenPrinter(auth, dto.purpose);
    return this.service.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':printerId')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @Body() dto: UpdatePrinterDto,
  ) {
    const current = await this.service.get(auth, printerId);
    await this.assertKitchenPrinter(auth, dto.purpose ?? current.purpose);
    return this.service.update(auth, printerId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':printerId/heartbeat')
  async heartbeat(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @Body() dto: PrinterHeartbeatDto,
  ) {
    const current = await this.service.get(auth, printerId);
    await this.assertKitchenPrinter(auth, current.purpose);
    return this.service.heartbeat(auth, printerId, dto);
  }

  private async assertKitchenPrinter(
    auth: AuthContext,
    purpose: string,
  ): Promise<void> {
    if (purpose === 'KITCHEN') {
      await this.subscriptions.assertEntitlement(
        assertOrganizationScope(auth),
        'KITCHEN_PRINTING',
      );
    }
  }
}
