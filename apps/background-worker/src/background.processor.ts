import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BACKGROUND_QUEUE } from '@fluxa/queue';

@Processor(BACKGROUND_QUEUE, { concurrency: 10 })
export class BackgroundProcessor extends WorkerHost {
  process(job: Job): Promise<unknown> {
    if (job.name === 'foundation.ping') {
      return Promise.resolve({
        ok: true,
        worker: 'background-worker',
        jobId: job.id,
      });
    }

    return Promise.reject(new Error(`Unsupported background job: ${job.name}`));
  }
}
