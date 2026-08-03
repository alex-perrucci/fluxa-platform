import { Module } from '@nestjs/common';
import { FiscalAccessService } from './fiscal-access.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalProfilesController } from './fiscal-profiles.controller';
import { FiscalProfilesService } from './fiscal-profiles.service';
import { FiscalQueueService } from './fiscal-queue.service';
import { RefundFiscalVoidService } from './refund-fiscal-void.service';

@Module({
  controllers: [FiscalProfilesController, FiscalDocumentsController],
  providers: [
    FiscalAccessService,
    FiscalProfilesService,
    FiscalDocumentsService,
    FiscalQueueService,
    RefundFiscalVoidService,
  ],
  exports: [FiscalDocumentsService, RefundFiscalVoidService],
})
export class FiscalModule {}
