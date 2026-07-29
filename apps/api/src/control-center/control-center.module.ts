// PHASE_10_RESERVATION_OPERATIONS
import { Module } from '@nestjs/common';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';
import { ReservationOperationsService } from './reservation-operations.service';

@Module({
  controllers: [ControlCenterController],
  providers: [ControlCenterService, ReservationOperationsService],
})
export class ControlCenterModule {}
