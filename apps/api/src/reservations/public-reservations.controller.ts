// PHASE_4_RESERVATION_ENGINE
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { ReservationEngineService } from './reservation-engine.service';

@Public()
@Controller('public/events')
export class PublicEventReservationsController {
  constructor(private readonly engine: ReservationEngineService) {}

  @Get(':slug/availability')
  availability(
    @Param('slug') slug: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.engine.availability(slug, query.partySize);
  }

  @Post(':slug/holds')
  createHold(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationHoldDto,
  ) {
    return this.engine.createHold(slug, dto);
  }
}

@Public()
@Controller('public/reservation-holds')
export class PublicReservationHoldsController {
  constructor(private readonly engine: ReservationEngineService) {}

  @Get(':holdToken')
  get(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.getHold(holdToken);
  }

  @Delete(':holdToken')
  cancel(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.cancelHold(holdToken);
  }
}
