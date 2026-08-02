// PHASE_5_RESERVATION_CONVERSION
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
import { ConvertHoldToReservationDto } from './dto/convert-hold-to-reservation.dto';
import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { EventInventoryReservationEngineService } from './event-inventory-reservation-engine.service';
import { ReservationConversionService } from './reservation-conversion.service';

@Public()
@Controller('public/events')
export class PublicEventReservationsController {
  constructor(private readonly engine: EventInventoryReservationEngineService) {}

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
  constructor(
    private readonly engine: EventInventoryReservationEngineService,
    private readonly conversion: ReservationConversionService,
  ) {}

  @Get(':holdToken')
  get(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.getHold(holdToken);
  }

  @Post(':holdToken/reservations')
  convert(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
    @Body() dto: ConvertHoldToReservationDto,
  ) {
    return this.conversion.convert(holdToken, dto);
  }

  @Delete(':holdToken')
  cancel(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.cancelHold(holdToken);
  }
}

@Public()
@Controller('public/reservations')
export class PublicReservationsController {
  constructor(private readonly conversion: ReservationConversionService) {}

  @Get(':reservationToken')
  get(
    @Param('reservationToken', new ParseUUIDPipe({ version: '4' }))
    reservationToken: string,
  ) {
    return this.conversion.getByToken(reservationToken);
  }
}
