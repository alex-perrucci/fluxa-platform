import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresEntitlement } from '../subscriptions/requires-entitlement.decorator';
import { DispatchKitchenTicketDto } from './dto/dispatch-kitchen-ticket.dto';
import { KitchenTicketListQueryDto } from './dto/kitchen-ticket-list-query.dto';
import { KitchenTicketMutationDto } from './dto/kitchen-ticket-mutation.dto';
import { KitchenService } from './kitchen.service';

@RequiresEntitlement('KITCHEN')
@Controller()
export class KitchenTicketsController {
  constructor(private readonly service: KitchenService) {}

  @RequiresEntitlement('KDS')
  @Get('kitchen-tickets')
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: KitchenTicketListQueryDto,
  ) {
    return this.service.listTickets(auth, query);
  }

  @RequiresEntitlement('KDS')
  @Get('kitchen-tickets/:ticketId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) id: string,
  ) {
    return this.service.getTicket(auth, id);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('orders/:orderId/kitchen-tickets')
  dispatch(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: DispatchKitchenTicketDto,
  ) {
    return this.service.dispatch(auth, orderId, dto);
  }

  @RequiresEntitlement('KDS')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('kitchen-tickets/:ticketId/start')
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: KitchenTicketMutationDto,
  ) {
    return this.service.transition(auth, id, dto, 'IN_PROGRESS');
  }

  @RequiresEntitlement('KDS')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('kitchen-tickets/:ticketId/ready')
  ready(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: KitchenTicketMutationDto,
  ) {
    return this.service.transition(auth, id, dto, 'READY');
  }

  @RequiresEntitlement('KDS')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('kitchen-tickets/:ticketId/serve')
  serve(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: KitchenTicketMutationDto,
  ) {
    return this.service.transition(auth, id, dto, 'SERVED');
  }

  @RequiresEntitlement('KDS')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('kitchen-tickets/:ticketId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: KitchenTicketMutationDto,
  ) {
    return this.service.transition(auth, id, dto, 'CANCELLED');
  }
}
