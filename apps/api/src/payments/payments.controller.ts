import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FiscalAutoIssueService } from '../fiscal/fiscal-auto-issue.service';
import { CapturePaymentDto } from './dto/capture-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { FailPaymentDto } from './dto/fail-payment.dto';
import { PaymentMutationDto } from './dto/payment-mutation.dto';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
    private readonly fiscalAutoIssue: FiscalAutoIssueService,
  ) {}

  @Get(':paymentId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.getPayment(auth, paymentId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':paymentId/refund-quote')
  refundQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.refundsService.quote(auth, paymentId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':paymentId/refunds')
  refunds(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.refundsService.list(auth, paymentId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':paymentId/refunds')
  refund(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.refundsService.create(auth, paymentId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post(':paymentId/capture')
  async capture(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: CapturePaymentDto,
  ) {
    const result = await this.paymentsService.capturePayment(
      auth,
      paymentId,
      dto,
    );
    if (result.checkout.status === 'COMPLETED') {
      await this.fiscalAutoIssue.issueAfterPaidOrder(
        auth,
        result.checkout.orderId,
      );
    }
    return result;
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post(':paymentId/fail')
  fail(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: FailPaymentDto,
  ) {
    return this.paymentsService.failPayment(auth, paymentId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post(':paymentId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: PaymentMutationDto,
  ) {
    return this.paymentsService.cancelPayment(auth, paymentId, dto);
  }
}
