import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdeAuthController } from './ade-auth.controller';
import { AdeAuthProfileService } from './ade-auth-profile.service';
import { AdeAuthService } from './ade-auth.service';
import { AdeBrowserService } from './ade-browser.service';
import { AdeCieCredentialsService } from './ade-cie-credentials.service';
import { AdeDocumentBrowserService } from './ade-document-browser.service';
import { AdeDocumentDryRunController } from './ade-document-dry-run.controller';
import { AdeDocumentDryRunService } from './ade-document-dry-run.service';
import { AdeDocumentOperationLockService } from './ade-document-operation-lock.service';
import { AdeDocumentSubmitBrowserService } from './ade-document-submit-browser.service';
import { AdeDocumentSubmitController } from './ade-document-submit.controller';
import { AdeDocumentSubmitService } from './ade-document-submit.service';
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
  controllers: [
    AdeHealthController,
    AdeDryRunController,
    AdeAuthController,
    AdeDocumentDryRunController,
    AdeDocumentSubmitController,
  ],
  providers: [
    AdeRuntimeConfigService,
    AdeBrowserService,
    AdeDocumentBrowserService,
    AdeDocumentSubmitBrowserService,
    AdeDocumentOperationLockService,
    AdeSessionService,
    AdeSelectorProfileService,
    AdeAuthProfileService,
    AdeCieCredentialsService,
    AdeInternalAuthGuard,
    AdeDryRunService,
    AdeDocumentDryRunService,
    AdeDocumentSubmitService,
    AdeAuthService,
    AdeWebFiscalService,
  ],
})
export class AdeFiscalWorkerModule {}
