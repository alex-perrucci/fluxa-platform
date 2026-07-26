// PHASE_3_EVENTS_MODULE
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CancelEventDto } from './dto/cancel-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { EventBookingRulesDto } from './dto/event-booking-rules.dto';
import { EventListQueryDto } from './dto/event-list-query.dto';
import { ReplaceEventTablesDto } from './dto/replace-event-tables.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: EventListQueryDto) {
    return this.eventsService.list(auth, query);
  }

  @Get(':eventId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.get(auth, eventId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateEventDto) {
    return this.eventsService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':eventId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':eventId/tables')
  replaceTables(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReplaceEventTablesDto,
  ) {
    return this.eventsService.replaceTables(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':eventId/booking-rules')
  updateBookingRules(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: EventBookingRulesDto,
  ) {
    return this.eventsService.updateBookingRules(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':eventId/publish')
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.publish(auth, eventId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':eventId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventsService.cancel(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':eventId')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.archive(auth, eventId);
  }
}
