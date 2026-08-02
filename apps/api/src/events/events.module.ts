// PHASE_9_PUBLIC_BOOKING
import { Module } from '@nestjs/common';
import { EventInventoryPublishingService } from './event-inventory-publishing.service';
import { EventTableGroupsService } from './event-table-groups.service';
import { EventsAccessService } from './events-access.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicEventsController } from './public-events.controller';
import { PublicEventsService } from './public-events.service';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [
    EventsAccessService,
    EventsService,
    EventTableGroupsService,
    EventInventoryPublishingService,
    PublicEventsService,
  ],
  exports: [EventsService, PublicEventsService],
})
export class EventsModule {}
