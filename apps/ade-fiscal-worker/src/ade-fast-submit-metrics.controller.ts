import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdeFastSubmitMetricsService } from './ade-fast-submit-metrics.service';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';

@Controller('internal/metrics')
@UseGuards(AdeInternalAuthGuard)
export class AdeFastSubmitMetricsController {
  constructor(private readonly metrics: AdeFastSubmitMetricsService) {}

  @Get('fast-submit')
  snapshot() {
    return this.metrics.snapshot();
  }
}
