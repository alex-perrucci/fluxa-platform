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
import { assertOrganizationScope } from '../auth/tenant-scope';
import { RequiresEntitlement } from '../subscriptions/requires-entitlement.decorator';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
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
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('print-jobs')
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PrintJobListQueryDto,
  ) {
    const result = await this.jobs.list(auth, query);
    if (
      await this.subscriptions.hasEntitlement(
        assertOrganizationScope(auth),
        'KITCHEN_PRINTING',
      )
    ) {
      return result;
    }
    return {
      ...result,
      items: result.items.filter(
        (job) => job.documentType !== 'KITCHEN_TICKET',
      ),
    };
  }

  @Get('print-jobs/:jobId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const job = await this.jobs.get(auth, jobId);
    await this.assertKitchenJob(auth, job.documentType);
    return job;
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

  @RequiresEntitlement('KITCHEN_PRINTING')
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
  async retry(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: PrintJobMutationDto,
  ) {
    const job = await this.jobs.get(auth, jobId);
    await this.assertKitchenJob(auth, job.documentType);
    return this.jobs.retry(auth, jobId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('print-jobs/:jobId/cancel')
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CancelPrintJobDto,
  ) {
    const job = await this.jobs.get(auth, jobId);
    await this.assertKitchenJob(auth, job.documentType);
    return this.jobs.cancel(auth, jobId, dto);
  }

  private async assertKitchenJob(
    auth: AuthContext,
    documentType: string,
  ): Promise<void> {
    if (documentType === 'KITCHEN_TICKET') {
      await this.subscriptions.assertEntitlement(
        assertOrganizationScope(auth),
        'KITCHEN_PRINTING',
      );
    }
  }
}
