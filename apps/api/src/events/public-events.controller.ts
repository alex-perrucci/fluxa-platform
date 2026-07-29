// PHASE_9_PUBLIC_BOOKING
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicEventListQueryDto } from './dto/public-event-list-query.dto';
import { PublicEventsService } from './public-events.service';

@Public()
@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly events: PublicEventsService) {}

  @Get()
  list(@Query() query: PublicEventListQueryDto) {
    return this.events.list(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.events.detail(slug);
  }
}
