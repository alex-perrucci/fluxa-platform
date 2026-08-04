import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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
import { RefundFiscalVoidService } from './refund-fiscal-void.service';

@Controller()
export class FiscalDocumentsController {
  constructor(
    private readonly documents: FiscalDocumentsService,
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
