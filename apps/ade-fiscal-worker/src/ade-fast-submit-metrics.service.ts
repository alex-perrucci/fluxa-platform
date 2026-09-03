import { Injectable, Logger } from '@nestjs/common';

const METRICS_WINDOW_SIZE = 200;

export type AdeFastSubmitMetricOutcome = 'SUCCESS' | 'REJECTED' | 'UNKNOWN' | 'FAILED_PRE_SUBMIT';

export interface AdeFastSubmitMetricsSnapshot {
  sampleCount: number;
  windowSize: number;
  p50Ms: number | null;
  p95Ms: number | null;
  lastMs: number | null;
  successCount: number;
  rejectedCount: number;
  unknownCount: number;
  failedPreSubmitCount: number;
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

@Injectable()
export class AdeFastSubmitMetricsService {
  private readonly logger = new Logger(AdeFastSubmitMetricsService.name);
  private readonly durationsMs: number[] = [];
  private successCount = 0;
  private rejectedCount = 0;
  private unknownCount = 0;
  private failedPreSubmitCount = 0;

  record(input: {
    durationMs: number;
    outcome: AdeFastSubmitMetricOutcome;
    confirmationEvidence?: string | null;
  }): AdeFastSubmitMetricsSnapshot {
    const durationMs = Math.max(0, Math.round(input.durationMs));
    this.durationsMs.push(durationMs);
    if (this.durationsMs.length > METRICS_WINDOW_SIZE) {
      this.durationsMs.splice(0, this.durationsMs.length - METRICS_WINDOW_SIZE);
    }

    switch (input.outcome) {
      case 'SUCCESS':
        this.successCount += 1;
        break;
      case 'REJECTED':
        this.rejectedCount += 1;
        break;
      case 'UNKNOWN':
        this.unknownCount += 1;
        break;
      case 'FAILED_PRE_SUBMIT':
        this.failedPreSubmitCount += 1;
        break;
    }

    const snapshot = this.snapshot();
    this.logger.log(
      `ADE fast submit metrics outcome=${input.outcome} evidence=${input.confirmationEvidence ?? '-'} lastMs=${durationMs} sampleCount=${snapshot.sampleCount} p50Ms=${snapshot.p50Ms ?? '-'} p95Ms=${snapshot.p95Ms ?? '-'} success=${snapshot.successCount} rejected=${snapshot.rejectedCount} unknown=${snapshot.unknownCount} failedPreSubmit=${snapshot.failedPreSubmitCount}`,
    );
    return snapshot;
  }

  snapshot(): AdeFastSubmitMetricsSnapshot {
    return {
      sampleCount: this.durationsMs.length,
      windowSize: METRICS_WINDOW_SIZE,
      p50Ms: percentile(this.durationsMs, 0.5),
      p95Ms: percentile(this.durationsMs, 0.95),
      lastMs: this.durationsMs.at(-1) ?? null,
      successCount: this.successCount,
      rejectedCount: this.rejectedCount,
      unknownCount: this.unknownCount,
      failedPreSubmitCount: this.failedPreSubmitCount,
    };
  }
}
