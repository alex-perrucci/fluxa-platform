import { Module } from '@nestjs/common';
import { CheckoutsController } from './checkouts.controller';
import { PaymentAccessService } from './payment-access.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [CheckoutsController, PaymentsController],
  providers: [PaymentsService, PaymentAccessService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
