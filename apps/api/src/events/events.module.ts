// PHASE_3_EVENTS_MODULE
import { Module } from '@nestjs/common';
import { EventsAccessService } from './events-access.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsAccessService, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
