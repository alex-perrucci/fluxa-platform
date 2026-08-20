import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdeAuthController } from './ade-auth.controller';
import { AdeAuthProfileService } from './ade-auth-profile.service';
import { AdeAuthService } from './ade-auth.service';
import { AdeBrowserService } from './ade-browser.service';
import { AdeCieCredentialsService } from './ade-cie-credentials.service';
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
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: ['req.headers', 'res.headers'],
          censor: '[Redacted]',
        },
      },
    }),
  ],
  controllers: [AdeHealthController, AdeDryRunController, AdeAuthController],
  providers: [
    AdeRuntimeConfigService,
    AdeBrowserService,
    AdeSessionService,
    AdeSelectorProfileService,
    AdeAuthProfileService,
    AdeCieCredentialsService,
    AdeInternalAuthGuard,
    AdeDryRunService,
    AdeAuthService,
    AdeWebFiscalService,
  ],
})
export class AdeFiscalWorkerModule {}
