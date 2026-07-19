import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { BackgroundWorkerModule } from './background-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    BackgroundWorkerModule,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Fluxa background worker started');
}

void bootstrap();
