import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderAdjustmentDto } from './dto/create-order-adjustment.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { OrderMutationDto } from './dto/order-mutation.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: OrderListQueryDto) {
    return this.ordersService.list(auth, query);
  }

  @Get(':orderId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.ordersService.get(auth, orderId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/items')
  addItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AddOrderItemDto,
  ) {
    return this.ordersService.addItem(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Patch(':orderId/items/:itemId')
  updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.ordersService.updateItem(auth, orderId, itemId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Delete(':orderId/items/:itemId')
  deleteItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: OrderMutationDto,
  ) {
    return this.ordersService.deleteItem(auth, orderId, itemId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':orderId/adjustments')
  addAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateOrderAdjustmentDto,
  ) {
    return this.ordersService.addAdjustment(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':orderId/adjustments/:adjustmentId')
  deleteAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('adjustmentId', ParseUUIDPipe) adjustmentId: string,
    @Body() dto: OrderMutationDto,
  ) {
    return this.ordersService.deleteAdjustment(
      auth,
      orderId,
      adjustmentId,
      dto,
    );
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/hold')
  hold(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderMutationDto,
  ) {
    return this.ordersService.hold(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/resume')
  resume(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderMutationDto,
  ) {
    return this.ordersService.resume(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':orderId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(auth, orderId, dto);
  }
}
