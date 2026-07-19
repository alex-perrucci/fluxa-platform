import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FISCAL_QUEUE } from '@fluxa/queue';

@Processor(FISCAL_QUEUE, { concurrency: 5 })
export class FiscalProcessor extends WorkerHost {
  process(job: Job): Promise<unknown> {
    if (job.name === 'foundation.ping') {
      return Promise.resolve({
        ok: true,
        worker: 'fiscal-worker',
        jobId: job.id,
      });
    }

    return Promise.reject(new Error(`Unsupported fiscal job: ${job.name}`));
  }
}
