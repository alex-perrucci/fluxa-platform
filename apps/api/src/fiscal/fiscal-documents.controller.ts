import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateRefundFiscalVoidDto } from './dto/create-refund-fiscal-void.dto';
import { FiscalDocumentListQueryDto } from './dto/fiscal-document-list-query.dto';
import {
  FiscalMutationDto,
  VoidFiscalDocumentDto,
} from './dto/fiscal-mutation.dto';
import { IssueFiscalDocumentDto } from './dto/issue-fiscal-document.dto';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalReceiptLayoutService } from './fiscal-receipt-layout.service';
import { FiscalReceiptPdfService } from './fiscal-receipt-pdf.service';
import { RefundFiscalVoidService } from './refund-fiscal-void.service';

@Controller()
export class FiscalDocumentsController {
  constructor(
    private readonly documents: FiscalDocumentsService,
    private readonly receiptLayout: FiscalReceiptLayoutService,
    private readonly receiptPdf: FiscalReceiptPdfService,
    private readonly refundVoids: RefundFiscalVoidService,
  ) {}

  @Roles(
    'OWNER',
    'ADMIN',
    'MANAGER',
    'CASHIER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  )
  @Get('fiscal-documents')
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: FiscalDocumentListQueryDto,
  ) {
    return this.documents.list(auth, query);
  }

  @Roles(
    'OWNER',
    'ADMIN',
    'MANAGER',
    'CASHIER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  )
  @Get('fiscal-documents/:documentId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.get(auth, documentId);
  }

  @Roles(
    'OWNER',
    'ADMIN',
    'MANAGER',
    'CASHIER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  )
  @Get('fiscal-documents/:documentId/receipt-layout')
  receiptLayoutData(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.receiptLayout.get(auth, documentId);
  }

  @Roles(
    'OWNER',
    'ADMIN',
    'MANAGER',
    'CASHIER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  )
  @Get('fiscal-documents/:documentId/receipt.pdf')
  async pdf(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const receipt = await this.receiptPdf.download(auth, documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${receipt.filename}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(receipt.bytes);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post('orders/:orderId/fiscalize')
  issue(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: IssueFiscalDocumentDto,
  ) {
    return this.documents.issue(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('fiscal-documents/:documentId/retry')
  retry(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: FiscalMutationDto,
  ) {
    return this.documents.retry(auth, documentId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Post('fiscal-documents/:documentId/void')
  void(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: VoidFiscalDocumentDto,
  ) {
    return this.documents.void(auth, documentId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Post('payment-refunds/:refundId/fiscal-void')
  refundVoid(
    @CurrentAuth() auth: AuthContext,
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: CreateRefundFiscalVoidDto,
  ) {
    return this.refundVoids.create(auth, refundId, dto);
  }
}
