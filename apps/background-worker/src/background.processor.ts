// PHASE_5_RESERVATION_CONVERSION
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BACKGROUND_QUEUE, RESERVATION_HOLD_EXPIRY_JOB } from '@fluxa/queue';
import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';
import { ReservationPaymentExpiryService } from './reservation-payment-expiry.service';

@Processor(BACKGROUND_QUEUE, { concurrency: 10 })
export class BackgroundProcessor extends WorkerHost {
  constructor(
    private readonly holdExpiry: ReservationHoldExpiryService,
    private readonly paymentExpiry: ReservationPaymentExpiryService,
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
      let expiredHolds = 0;
      let expiredReservations = 0;

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.holdExpiry.expireAvailable(200);
        expiredHolds += count;

        if (count < 200) {
          break;
        }
      }

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.paymentExpiry.expireAvailable(200);
        expiredReservations += count;

        if (count < 200) {
          break;
        }
      }

      return {
        ok: true,
        job: RESERVATION_HOLD_EXPIRY_JOB,
        expiredHolds,
        expiredReservations,
      };
    }

    throw new Error(`Unsupported background job: ${job.name}`);
  }
}
