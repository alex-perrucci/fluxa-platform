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
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ControlCenterService } from './control-center.service';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { MerchantOverviewQueryDto } from './dto/merchant-overview-query.dto';
import { MerchantReservationListQueryDto } from './dto/merchant-reservation-list-query.dto';
import { ReservationFeedQueryDto } from './dto/reservation-feed-query.dto';
import { ReservationOperationDto } from './dto/reservation-operation.dto';
import { ReservationOperationAction } from './reservation-operations-policy';
import { ReservationOperationsService } from './reservation-operations.service';

@Controller('control-center')
export class ControlCenterController {
  constructor(
    private readonly controlCenter: ControlCenterService,
    private readonly merchantDashboard: MerchantDashboardService,
    private readonly operations: ReservationOperationsService,
  ) {}

  @Get('merchant-overview')
  overview(
    @CurrentAuth() auth: AuthContext,
    @Query() query: MerchantOverviewQueryDto,
  ) {
    return this.merchantDashboard.overview(auth, query.locationId);
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
