import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FISCAL_QUEUE } from '@fluxa/queue';

@Injectable()
export class FiscalQueueService {
  constructor(@InjectQueue(FISCAL_QUEUE) private readonly queue: Queue) {}

  async enqueue(documentId: string): Promise<void> {
    await this.queue.add(
      'fiscal.document.execute',
      { documentId },
      {
        jobId: `fiscal-${documentId}`,
        attempts: 10,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
