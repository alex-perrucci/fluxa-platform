import { Module } from '@nestjs/common';
import { FiscalAccessService } from './fiscal-access.service';
import { FiscalAutoIssueService } from './fiscal-auto-issue.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';
import {
  FiscalProfilesController,
  PlatformFiscalProfilesController,
} from './fiscal-profiles.controller';
import { FiscalProfilesService } from './fiscal-profiles.service';
import { FiscalQueueService } from './fiscal-queue.service';
import { FiscalReceiptLayoutService } from './fiscal-receipt-layout.service';
import { FiscalReceiptPdfService } from './fiscal-receipt-pdf.service';
import { RefundFiscalVoidService } from './refund-fiscal-void.service';

@Module({
  controllers: [
    FiscalProfilesController,
    PlatformFiscalProfilesController,
    FiscalDocumentsController,
  ],
  providers: [
    FiscalAccessService,
    FiscalAutoIssueService,
    FiscalProfilesService,
    FiscalDocumentsService,
    FiscalQueueService,
    FiscalReceiptLayoutService,
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
