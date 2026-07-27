// PHASE_4_RESERVATION_ENGINE
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  BACKGROUND_QUEUE,
  RESERVATION_HOLD_EXPIRY_JOB,
  RESERVATION_HOLD_EXPIRY_SCHEDULER,
} from '@fluxa/queue';

@Injectable()
export class ReservationHoldSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(BACKGROUND_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RESERVATION_HOLD_EXPIRY_SCHEDULER,
      {
        every: 30_000,
      },
      {
        name: RESERVATION_HOLD_EXPIRY_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5_000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
  }
}
