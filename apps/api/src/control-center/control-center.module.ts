// PHASE_10_RESERVATION_OPERATIONS
import { Module } from '@nestjs/common';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { ReservationOperationsService } from './reservation-operations.service';
import { SalesBackofficeService } from './sales-backoffice.service';
import { SalesExportService } from './sales-export.service';

@Module({
  controllers: [ControlCenterController],
  providers: [
    ControlCenterService,
    MerchantDashboardService,
    ReservationOperationsService,
    SalesBackofficeService,
    SalesExportService,
  ],
})
export class ControlCenterModule {}
