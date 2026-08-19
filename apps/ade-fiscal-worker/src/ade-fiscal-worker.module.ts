import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdeBrowserService } from './ade-browser.service';
import { AdeDryRunController } from './ade-dry-run.controller';
import { AdeDryRunService } from './ade-dry-run.service';
import { AdeHealthController } from './ade-health.controller';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSelectorProfileService } from './ade-selector-profile.service';
import { AdeSessionService } from './ade-session.service';
import { AdeWebFiscalService } from './ade-web-fiscal.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
  ],
  controllers: [AdeHealthController, AdeDryRunController],
  providers: [
    AdeRuntimeConfigService,
    AdeBrowserService,
    AdeSessionService,
    AdeSelectorProfileService,
    AdeInternalAuthGuard,
    AdeDryRunService,
    AdeWebFiscalService,
  ],
})
export class AdeFiscalWorkerModule {}
