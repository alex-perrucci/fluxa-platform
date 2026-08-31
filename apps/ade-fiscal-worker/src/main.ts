import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AdeFiscalWorkerModule } from './ade-fiscal-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AdeFiscalWorkerModule);
  app.enableShutdownHooks();

  const rawPort = process.env.ADE_WORKER_PORT ?? '3010';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ADE_WORKER_PORT: ${rawPort}`);
  }

  await app.listen(port, '0.0.0.0');
  Logger.log(`ADE fiscal worker started on port ${port}.`, 'AdeFiscalWorker');
}

void bootstrap();
