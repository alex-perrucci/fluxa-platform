import { Global, Module } from '@nestjs/common';
import { EntitlementGuard } from './entitlement.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Global()
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, EntitlementGuard],
  exports: [SubscriptionsService, EntitlementGuard],
})
export class SubscriptionsModule {}
