import { Module } from '@nestjs/common';
import { DiningAreasController } from './dining-areas.controller';
import { DiningTablesController } from './dining-tables.controller';
import { HospitalityAccessService } from './hospitality-access.service';
import { HospitalityService } from './hospitality.service';
import { KitchenStationsController } from './kitchen-stations.controller';
import { KitchenTicketsController } from './kitchen-tickets.controller';
import { KitchenService } from './kitchen.service';
import { TableSessionsController } from './table-sessions.controller';
@Module({
  controllers: [
    DiningAreasController,
    DiningTablesController,
    TableSessionsController,
    KitchenStationsController,
    KitchenTicketsController,
  ],
  providers: [HospitalityAccessService, HospitalityService, KitchenService],
  exports: [HospitalityService, KitchenService],
})
export class HospitalityModule {}
