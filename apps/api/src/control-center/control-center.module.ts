// PHASE_10_RESERVATION_OPERATIONS
import { Module } from '@nestjs/common';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { ReservationOperationsService } from './reservation-operations.service';

@Module({
  controllers: [ControlCenterController],
  providers: [
    ControlCenterService,
    MerchantDashboardService,
    ReservationOperationsService,
  ],
})
export class ControlCenterModule {}
