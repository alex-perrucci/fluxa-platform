import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddManualOrderItemDto } from './dto/add-manual-order-item.dto';
import { ManualOrderItemsService } from './manual-order-items.service';

@Controller('orders')
export class ManualOrderItemsController {
  constructor(private readonly manualItems: ManualOrderItemsService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post(':orderId/manual-items')
  add(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AddManualOrderItemDto,
  ) {
    return this.manualItems.add(auth, orderId, dto);
  }
}
