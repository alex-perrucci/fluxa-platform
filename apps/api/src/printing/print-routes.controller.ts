import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrintRouteListQueryDto } from './dto/print-route-list-query.dto';
import { UpsertPrintRouteDto } from './dto/upsert-print-route.dto';
import { PrintersService } from './printers.service';

@Controller('print-routes')
export class PrintRoutesController {
  constructor(
    private readonly service: PrintersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PrintRouteListQueryDto,
  ) {
    const routes = await this.service.listRoutes(auth, query);
    const canUseKitchenPrinting = await this.subscriptions.hasEntitlement(
      assertOrganizationScope(auth),
      'KITCHEN_PRINTING',
    );
    return canUseKitchenPrinting
      ? routes
      : routes.filter((route) => route.documentType !== 'KITCHEN_TICKET');
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put()
  async upsert(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertPrintRouteDto,
  ) {
    if (dto.documentType === 'KITCHEN_TICKET' || dto.kitchenStationId) {
      await this.subscriptions.assertEntitlement(
        assertOrganizationScope(auth),
        'KITCHEN_PRINTING',
      );
    }
    return this.service.upsertRoute(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':routeId')
  async delete(
    @CurrentAuth() auth: AuthContext,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const route = await this.database.pool.query<
      { documentType: string } & QueryResultRow
    >(
      `SELECT document_type AS "documentType" FROM printer_routes
       WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [routeId, organizationId],
    );
    if (route.rows[0]?.documentType === 'KITCHEN_TICKET') {
      await this.subscriptions.assertEntitlement(
        organizationId,
        'KITCHEN_PRINTING',
      );
    }
    return this.service.deleteRoute(auth, routeId);
  }
}
