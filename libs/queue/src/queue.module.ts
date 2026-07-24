import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BACKGROUND_QUEUE, FISCAL_QUEUE } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.getOrThrow<boolean>('REDIS_TLS') ? {} : undefined,
          maxRetriesPerRequest: null,
        },
        prefix: 'fluxa',
      }),
    }),
    BullModule.registerQueue(
      { name: FISCAL_QUEUE },
      { name: BACKGROUND_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
