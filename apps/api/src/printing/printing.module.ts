import { Module } from '@nestjs/common';
import { PaymentReceiptPrinterService } from './payment-receipt-printer.service';
import { PrintAgentController } from './print-agent.controller';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';
import { PrintProducerService } from './print-producer.service';
import { PrintRoutesController } from './print-routes.controller';
import { PrintersController } from './printers.controller';
import { PrintersService } from './printers.service';
import { PrintingAccessService } from './printing-access.service';

@Module({
  controllers: [
    PrintersController,
    PrintRoutesController,
    PrintJobsController,
    PrintAgentController,
  ],
  providers: [
    PrintingAccessService,
    PrintersService,
    PrintProducerService,
    PaymentReceiptPrinterService,
    PrintJobsService,
  ],
  exports: [PrintProducerService],
})
export class PrintingModule {}
