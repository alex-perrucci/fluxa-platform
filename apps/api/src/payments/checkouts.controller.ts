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
import { FiscalAutoIssueService } from '../fiscal/fiscal-auto-issue.service';
import { CancelCheckoutDto } from './dto/cancel-checkout.dto';
import { CheckoutListQueryDto } from './dto/checkout-list-query.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { OpenCheckoutDto } from './dto/open-checkout.dto';
import { PaymentsService } from './payments.service';

@Controller('checkouts')
export class CheckoutsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly fiscalAutoIssue: FiscalAutoIssueService,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: CheckoutListQueryDto) {
    return this.paymentsService.list(auth, query);
  }

  @Get(':checkoutId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
  ) {
    return this.paymentsService.get(auth, checkoutId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post()
  open(@CurrentAuth() auth: AuthContext, @Body() dto: OpenCheckoutDto) {
    return this.paymentsService.open(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post(':checkoutId/payments')
  async createPayment(
    @CurrentAuth() auth: AuthContext,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const result = await this.paymentsService.createPayment(
      auth,
      checkoutId,
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
  @Post(':checkoutId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
    @Body() dto: CancelCheckoutDto,
  ) {
    return this.paymentsService.cancelCheckout(auth, checkoutId, dto);
  }
}
