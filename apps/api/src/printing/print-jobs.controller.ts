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
import { CancelPrintJobDto } from './dto/cancel-print-job.dto';
import { PrintJobListQueryDto } from './dto/print-job-list-query.dto';
import { PrintJobMutationDto } from './dto/print-job-mutation.dto';
import { RequestPrintDto } from './dto/request-print.dto';
import { PaymentReceiptPrinterService } from './payment-receipt-printer.service';
import { PrintJobsService } from './print-jobs.service';
import { PrintProducerService } from './print-producer.service';

@Controller()
export class PrintJobsController {
  constructor(
    private readonly jobs: PrintJobsService,
    private readonly producer: PrintProducerService,
    private readonly paymentReceiptPrinter: PaymentReceiptPrinterService,
  ) {}

  @Get('print-jobs')
  list(@CurrentAuth() auth: AuthContext, @Query() query: PrintJobListQueryDto) {
    return this.jobs.list(auth, query);
  }

  @Get('print-jobs/:jobId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.jobs.get(auth, jobId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('printers/:printerId/test')
  test(
    @CurrentAuth() auth: AuthContext,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @Body() dto: RequestPrintDto,
  ) {
    return this.producer.requestTestPage(auth, printerId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('orders/:orderId/print-receipt')
  orderReceipt(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RequestPrintDto,
  ) {
    return this.producer.requestOrderReceipt(auth, orderId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Get('checkouts/:checkoutId/print-options')
  paymentReceiptOptions(
    @CurrentAuth() auth: AuthContext,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
  ) {
    return this.paymentReceiptPrinter.listOptions(auth, checkoutId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('checkouts/:checkoutId/print-receipt')
  paymentReceipt(
    @CurrentAuth() auth: AuthContext,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
    @Body() dto: RequestPrintDto,
  ) {
    return dto.printerId
      ? this.paymentReceiptPrinter.requestExplicit(auth, checkoutId, dto)
      : this.producer.requestPaymentReceipt(auth, checkoutId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('kitchen-tickets/:ticketId/reprint')
  kitchenTicket(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: RequestPrintDto,
  ) {
    return this.producer.requestKitchenTicket(auth, ticketId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('print-jobs/:jobId/retry')
  retry(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: PrintJobMutationDto,
  ) {
    return this.jobs.retry(auth, jobId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('print-jobs/:jobId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CancelPrintJobDto,
  ) {
    return this.jobs.cancel(auth, jobId, dto);
  }
}
