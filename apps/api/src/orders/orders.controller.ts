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
import { assertOrganizationScope } from '../auth/tenant-scope';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
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
  constructor(
    private readonly ordersService: OrdersService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

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
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateOrderDto) {
    if (dto.serviceMode === 'TABLE') {
      await this.subscriptions.assertEntitlement(
        assertOrganizationScope(auth),
        'TABLE_SERVICE',
      );
    }
    return this.ordersService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/items')
  async addItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AddOrderItemDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.addItem(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Patch(':orderId/items/:itemId')
  async updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.updateItem(auth, orderId, itemId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Delete(':orderId/items/:itemId')
  async deleteItem(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: OrderMutationDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.deleteItem(auth, orderId, itemId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':orderId/adjustments')
  async addAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateOrderAdjustmentDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.addAdjustment(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':orderId/adjustments/:adjustmentId')
  async deleteAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('adjustmentId', ParseUUIDPipe) adjustmentId: string,
    @Body() dto: OrderMutationDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.deleteAdjustment(
      auth,
      orderId,
      adjustmentId,
      dto,
    );
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/hold')
  async hold(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderMutationDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.hold(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/resume')
  async resume(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderMutationDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.resume(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':orderId/cancel')
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    await this.assertTableOrderEntitlement(auth, orderId);
    return this.ordersService.cancel(auth, orderId, dto);
  }

  private async assertTableOrderEntitlement(
    auth: AuthContext,
    orderId: string,
  ): Promise<void> {
    const order = await this.ordersService.get(auth, orderId);
    if (order.serviceMode === 'TABLE') {
      await this.subscriptions.assertEntitlement(
        assertOrganizationScope(auth),
        'TABLE_SERVICE',
      );
    }
  }
}
