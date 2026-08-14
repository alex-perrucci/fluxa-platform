import { Module } from '@nestjs/common';
import { ManualOrderItemsController } from './manual-order-items.controller';
import { ManualOrderItemsService } from './manual-order-items.service';
import { OrderAccessService } from './order-access.service';
import { OrderPricingService } from './order-pricing.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController, ManualOrderItemsController],
  providers: [
    OrdersService,
    ManualOrderItemsService,
    OrderAccessService,
    OrderPricingService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
