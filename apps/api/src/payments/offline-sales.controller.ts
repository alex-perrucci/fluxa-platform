import { Body, Controller, Post } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FiscalAutoIssueService } from '../fiscal/fiscal-auto-issue.service';
import { ReplayOfflineSaleDto } from './dto/replay-offline-sale.dto';
import { OfflineSalesService } from './offline-sales.service';

@Controller('offline-sales')
export class OfflineSalesController {
  constructor(
    private readonly offlineSales: OfflineSalesService,
    private readonly fiscalAutoIssue: FiscalAutoIssueService,
  ) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @Post('replay')
  async replay(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ReplayOfflineSaleDto,
  ) {
    const result = await this.offlineSales.replay(auth, dto);

    // The financial transaction is already committed and idempotent here.
    // Fiscalization is deliberately best-effort, exactly like an online cash
    // payment: a fiscal outage must never make the operator repeat the sale.
    await this.fiscalAutoIssue.issueAfterPaidOrder(auth, result.orderId);
    return result;
  }
}
