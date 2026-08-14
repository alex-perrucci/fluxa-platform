import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { CheckoutsController } from './checkouts.controller';
import { PaymentAccessService } from './payment-access.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundProviderService } from './refund-provider.service';
import { RefundsService } from './refunds.service';

@Module({
  imports: [FiscalModule],
  controllers: [CheckoutsController, PaymentsController],
  providers: [
    PaymentsService,
    PaymentAccessService,
    RefundProviderService,
    RefundsService,
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
