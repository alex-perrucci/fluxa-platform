// PHASE_9_PUBLIC_BOOKING
import { Module } from '@nestjs/common';
import { EventsAccessService } from './events-access.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicEventsController } from './public-events.controller';
import { PublicEventsService } from './public-events.service';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsAccessService, EventsService, PublicEventsService],
  exports: [EventsService, PublicEventsService],
})
export class EventsModule {}
