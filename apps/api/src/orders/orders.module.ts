import { Module } from '@nestjs/common';
import { OrderAccessService } from './order-access.service';
import { OrderPricingService } from './order-pricing.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderAccessService, OrderPricingService],
  exports: [OrdersService],
})
export class OrdersModule {}
