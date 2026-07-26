// PHASE_4_RESERVATION_ENGINE
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BACKGROUND_QUEUE, RESERVATION_HOLD_EXPIRY_JOB } from '@fluxa/queue';
import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';

@Processor(BACKGROUND_QUEUE, { concurrency: 10 })
export class BackgroundProcessor extends WorkerHost {
  constructor(
    private readonly reservationHoldExpiry: ReservationHoldExpiryService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'foundation.ping') {
      return {
        ok: true,
        worker: 'background-worker',
        jobId: job.id,
      };
    }

    if (job.name === RESERVATION_HOLD_EXPIRY_JOB) {
      let expired = 0;

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.reservationHoldExpiry.expireAvailable(200);
        expired += count;

        if (count < 200) {
          break;
        }
      }

      return {
        ok: true,
        job: RESERVATION_HOLD_EXPIRY_JOB,
        expired,
      };
    }

    throw new Error(`Unsupported background job: ${job.name}`);
  }
}
