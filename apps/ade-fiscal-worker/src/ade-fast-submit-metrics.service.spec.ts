import { AdeFastSubmitMetricsService } from './ade-fast-submit-metrics.service';

describe('AdeFastSubmitMetricsService', () => {
  it('reports deterministic p50 and p95 values', () => {
    const service = new AdeFastSubmitMetricsService();

    for (let durationMs = 1; durationMs <= 20; durationMs += 1) {
      service.record({ durationMs, outcome: 'SUCCESS' });
    }

    expect(service.snapshot()).toMatchObject({
      sampleCount: 20,
      windowSize: 200,
      p50Ms: 10,
      p95Ms: 19,
      lastMs: 20,
      successCount: 20,
      rejectedCount: 0,
      unknownCount: 0,
      failedPreSubmitCount: 0,
    });
  });

  it('keeps only the latest 200 latency samples while retaining counters', () => {
    const service = new AdeFastSubmitMetricsService();

    for (let index = 0; index < 205; index += 1) {
      service.record({
        durationMs: index,
        outcome: index === 204 ? 'UNKNOWN' : 'FAILED_PRE_SUBMIT',
      });
    }

    expect(service.snapshot()).toMatchObject({
      sampleCount: 200,
      lastMs: 204,
      unknownCount: 1,
      failedPreSubmitCount: 204,
    });
  });
});
