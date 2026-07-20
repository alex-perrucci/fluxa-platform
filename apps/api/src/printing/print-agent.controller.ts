import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClaimPrintJobDto } from './dto/claim-print-job.dto';
import { CompletePrintJobDto } from './dto/complete-print-job.dto';
import { FailPrintJobDto } from './dto/fail-print-job.dto';
import { PrintJobsService } from './print-jobs.service';

@Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
@Controller('print-agent')
export class PrintAgentController {
  constructor(private readonly jobs: PrintJobsService) {}

  @Post('jobs/claim')
  claim(@CurrentAuth() auth: AuthContext, @Body() dto: ClaimPrintJobDto) {
    return this.jobs.claim(auth, dto);
  }

  @Post('jobs/:jobId/complete')
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CompletePrintJobDto,
  ) {
    return this.jobs.complete(auth, jobId, dto);
  }

  @Post('jobs/:jobId/fail')
  fail(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: FailPrintJobDto,
  ) {
    return this.jobs.fail(auth, jobId, dto);
  }
}
