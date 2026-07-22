import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { BackgroundWorkerModule } from './background-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    BackgroundWorkerModule,
    {
      bufferLogs: true,
    },
  );
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  logger.log('Fluxa background worker started');
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`Fluxa background worker failed to start: ${message}`);
  process.exitCode = 1;
});
