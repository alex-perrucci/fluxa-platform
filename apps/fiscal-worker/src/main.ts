import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { FiscalWorkerModule } from './fiscal-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(FiscalWorkerModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Fluxa fiscal worker started');
}

void bootstrap();
