import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FISCAL_QUEUE } from '@fluxa/queue';
import { FiscalExecutionService } from './fiscal-execution.service';

interface FiscalJobData {
  documentId: string;
}

@Processor(FISCAL_QUEUE, { concurrency: 5 })
export class FiscalProcessor extends WorkerHost {
  constructor(private readonly execution: FiscalExecutionService) {
    super();
  }

  process(job: Job<FiscalJobData>): Promise<unknown> {
    if (job.name === 'foundation.ping')
      return Promise.resolve({
        ok: true,
        worker: 'fiscal-worker',
        jobId: job.id,
      });
    if (job.name === 'fiscal.document.execute')
      return this.execution.execute(job.data.documentId);
    return Promise.reject(new Error(`Unsupported fiscal job: ${job.name}`));
  }
}
