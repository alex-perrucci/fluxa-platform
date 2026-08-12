import { Module } from '@nestjs/common';
import { PrintingModule } from '../printing/printing.module';
import { DiningAreasController } from './dining-areas.controller';
import { DiningTablesController } from './dining-tables.controller';
import { HospitalityAccessService } from './hospitality-access.service';
import { HospitalityService } from './hospitality.service';
import { KitchenConfigurationController } from './kitchen-configuration.controller';
import { KitchenConfigurationService } from './kitchen-configuration.service';
import { KitchenStationsController } from './kitchen-stations.controller';
import { KitchenTicketsController } from './kitchen-tickets.controller';
import { KitchenService } from './kitchen.service';
import { TableSessionsController } from './table-sessions.controller';

@Module({
  imports: [PrintingModule],
  controllers: [
    DiningAreasController,
    DiningTablesController,
    TableSessionsController,
    KitchenStationsController,
    KitchenTicketsController,
    KitchenConfigurationController,
  ],
  providers: [
    HospitalityAccessService,
    HospitalityService,
    KitchenService,
    KitchenConfigurationService,
  ],
  exports: [HospitalityService, KitchenService],
})
export class HospitalityModule {}
