import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from '@fluxa/config';
import { DatabaseModule } from '@fluxa/database';
import { QueueModule } from '@fluxa/queue';
import { AdeProcessingRecoveryService } from './ade-processing-recovery.service';
import { FiscalExecutionService } from './fiscal-execution.service';
import { FiscalProcessor } from './fiscal.processor';
import { FiscalProviderService } from './fiscal-provider.service';
import { AdeWebFiscalProvider } from './providers/ade-web-fiscal.provider';
import { FiscalProviderRegistry } from './providers/fiscal-provider.registry';
import { LegacyFiscalProviderAdapter } from './providers/legacy-fiscal.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
    DatabaseModule,
    QueueModule,
  ],
  providers: [
    FiscalProcessor,
    FiscalExecutionService,
    FiscalProviderService,
    LegacyFiscalProviderAdapter,
    AdeWebFiscalProvider,
    FiscalProviderRegistry,
    AdeProcessingRecoveryService,
  ],
})
export class FiscalWorkerModule {}
