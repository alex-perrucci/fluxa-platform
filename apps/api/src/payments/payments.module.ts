import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { CheckoutsController } from './checkouts.controller';
import { OfflineSalesController } from './offline-sales.controller';
import { OfflineSalesService } from './offline-sales.service';
import { PaymentAccessService } from './payment-access.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundProviderService } from './refund-provider.service';
import { RefundsService } from './refunds.service';

@Module({
  imports: [FiscalModule],
  controllers: [
    CheckoutsController,
    PaymentsController,
    OfflineSalesController,
  ],
  providers: [
    PaymentsService,
    OfflineSalesService,
    PaymentAccessService,
    RefundProviderService,
    RefundsService,
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
