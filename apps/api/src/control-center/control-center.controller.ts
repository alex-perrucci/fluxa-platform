// PHASE_10_RESERVATION_OPERATIONS
import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ControlCenterService } from './control-center.service';
import {
  FiscalBackofficeQueryDto,
  PaymentBackofficeQueryDto,
  SalesListQueryDto,
  SalesReportQueryDto,
} from './dto/sales-backoffice-query.dto';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { MerchantOverviewQueryDto } from './dto/merchant-overview-query.dto';
import { MerchantReservationListQueryDto } from './dto/merchant-reservation-list-query.dto';
import { ReservationFeedQueryDto } from './dto/reservation-feed-query.dto';
import { ReservationOperationDto } from './dto/reservation-operation.dto';
import { ReservationOperationAction } from './reservation-operations-policy';
import { ReservationOperationsService } from './reservation-operations.service';
import { SalesBackofficeService } from './sales-backoffice.service';

const SALES_READ_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'ACCOUNTANT',
  'SUPPORT_READONLY',
] as const;

@Controller('control-center')
export class ControlCenterController {
  constructor(
    private readonly controlCenter: ControlCenterService,
    private readonly merchantDashboard: MerchantDashboardService,
    private readonly operations: ReservationOperationsService,
    private readonly salesBackoffice: SalesBackofficeService,
  ) {}

  @Get('merchant-overview')
  overview(
    @CurrentAuth() auth: AuthContext,
    @Query() query: MerchantOverviewQueryDto,
  ) {
    return this.merchantDashboard.overview(auth, query.locationId);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/orders')
  salesOrders(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SalesListQueryDto,
  ) {
    return this.salesBackoffice.orders(auth, query);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/orders/:orderId')
  salesOrder(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ) {
    return this.salesBackoffice.order(auth, orderId);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/payments')
  salesPayments(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaymentBackofficeQueryDto,
  ) {
    return this.salesBackoffice.payments(auth, query);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/fiscal-documents')
  salesFiscalDocuments(
    @CurrentAuth() auth: AuthContext,
    @Query() query: FiscalBackofficeQueryDto,
  ) {
    return this.salesBackoffice.fiscalDocuments(auth, query);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/reports')
  salesReports(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.salesBackoffice.report(auth, query);
  }

  @Roles(...SALES_READ_ROLES)
  @Get('sales/reports.csv')
  async salesReportsCsv(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SalesReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader(
      'content-disposition',
      'attachment; filename="fluxa-sales-report.csv"',
    );
    return this.salesBackoffice.reportCsv(auth, query);
  }

  @Get('reservations')
  reservations(
    @CurrentAuth() auth: AuthContext,
    @Query() query: MerchantReservationListQueryDto,
  ) {
    return this.controlCenter.reservations(auth, query);
  }

  @Get('reservations/:reservationId')
  reservation(
    @CurrentAuth() auth: AuthContext,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
  ) {
    return this.controlCenter.reservationDetail(auth, reservationId);
  }

  @Get('reservation-feed')
  reservationFeed(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ReservationFeedQueryDto,
  ) {
    return this.controlCenter.reservationFeed(auth, query);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('reservations/:reservationId/actions/:action')
  reservationAction(
    @CurrentAuth() auth: AuthContext,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Param('action', new ParseEnumPipe(ReservationOperationAction))
    action: ReservationOperationAction,
    @Body() dto: ReservationOperationDto,
  ) {
    return this.operations.apply(auth, reservationId, action, dto);
  }
}
