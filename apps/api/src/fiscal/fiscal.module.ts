import { Module } from '@nestjs/common';
import { FiscalAccessService } from './fiscal-access.service';
import { FiscalAutoIssueService } from './fiscal-auto-issue.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalProfilesController } from './fiscal-profiles.controller';
import { FiscalProfilesService } from './fiscal-profiles.service';
import { FiscalQueueService } from './fiscal-queue.service';
import { FiscalReceiptPdfService } from './fiscal-receipt-pdf.service';
import { RefundFiscalVoidService } from './refund-fiscal-void.service';

@Module({
  controllers: [FiscalProfilesController, FiscalDocumentsController],
  providers: [
    FiscalAccessService,
    FiscalAutoIssueService,
    FiscalProfilesService,
    FiscalDocumentsService,
    FiscalQueueService,
    FiscalReceiptPdfService,
    RefundFiscalVoidService,
  ],
  exports: [
    FiscalAutoIssueService,
    FiscalDocumentsService,
    RefundFiscalVoidService,
  ],
})
export class FiscalModule {}
