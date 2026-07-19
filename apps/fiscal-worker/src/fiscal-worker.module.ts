import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from '@fluxa/config';
import { DatabaseModule } from '@fluxa/database';
import { QueueModule } from '@fluxa/queue';
import { FiscalProcessor } from './fiscal.processor';

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
  providers: [FiscalProcessor],
})
export class FiscalWorkerModule {}
