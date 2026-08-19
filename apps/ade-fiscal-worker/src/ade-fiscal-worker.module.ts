import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdeHealthController } from './ade-health.controller';
import { AdeWebFiscalService } from './ade-web-fiscal.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
  ],
  controllers: [AdeHealthController],
  providers: [AdeWebFiscalService],
})
export class AdeFiscalWorkerModule {}
