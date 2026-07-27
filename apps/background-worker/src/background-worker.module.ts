import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from '@fluxa/config';
import { DatabaseModule } from '@fluxa/database';
import { QueueModule } from '@fluxa/queue';
import { BackgroundProcessor } from './background.processor';
import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';
import { ReservationHoldSchedulerService } from './reservation-hold-scheduler.service';
import { ReservationPaymentExpiryService } from './reservation-payment-expiry.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
    DatabaseModule,
    QueueModule,
  ],
  providers: [
    BackgroundProcessor,
    ReservationHoldExpiryService,
    ReservationHoldSchedulerService,
    ReservationPaymentExpiryService,
  ],
})
export class BackgroundWorkerModule {}
