import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDryRunService } from './ade-dry-run.service';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';

function statusFor(error: AdeAutomationError): HttpStatus {
  switch (error.code) {
    case 'ADE_DRY_RUN_BUSY':
      return HttpStatus.CONFLICT;
    case 'ADE_SESSION_REQUIRED':
    case 'ADE_SESSION_INVALID':
      return HttpStatus.PRECONDITION_FAILED;
    case 'ADE_MARKER_NOT_FOUND':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'ADE_NAVIGATION_FAILED':
      return HttpStatus.BAD_GATEWAY;
    case 'ADE_BROWSER_UNAVAILABLE':
    case 'ADE_DRY_RUN_DISABLED':
    case 'ADE_CONFIGURATION_INVALID':
    case 'ADE_SELECTOR_PROFILE_INVALID':
    case 'ADE_INTERNAL_AUTH_REQUIRED':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function publicMessage(error: AdeAutomationError): string {
  switch (error.code) {
    case 'ADE_DRY_RUN_DISABLED':
      return 'Dry-run AdE disabilitato.';
    case 'ADE_DRY_RUN_BUSY':
      return 'Un dry-run AdE è già in corso.';
    case 'ADE_INTERNAL_AUTH_REQUIRED':
      return 'Autenticazione interna AdE non configurata.';
    case 'ADE_CONFIGURATION_INVALID':
      return 'Configurazione AdE incompleta o non valida.';
    case 'ADE_SESSION_REQUIRED':
      return 'Sessione AdE richiesta.';
    case 'ADE_SESSION_INVALID':
      return 'Sessione AdE non valida.';
    case 'ADE_BROWSER_UNAVAILABLE':
      return 'Browser automation non disponibile.';
    case 'ADE_NAVIGATION_FAILED':
      return 'Navigazione AdE non riuscita.';
    case 'ADE_SELECTOR_PROFILE_INVALID':
      return 'Profilo selector AdE non valido.';
    case 'ADE_MARKER_NOT_FOUND':
      return 'La pagina AdE non corrisponde al profilo selector configurato.';
    default:
      return 'Dry-run AdE non riuscito.';
  }
}

@Controller('internal')
@UseGuards(AdeInternalAuthGuard)
export class AdeDryRunController {
  constructor(private readonly dryRun: AdeDryRunService) {}

  @Post('dry-run')
  async run() {
    try {
      return await this.dryRun.run();
    } catch (error) {
      if (!(error instanceof AdeAutomationError)) throw error;
      throw new HttpException(
        {
          code: error.code,
          category: error.category,
          message: publicMessage(error),
          retrySafe: error.retrySafe,
          submitAttempted: false,
          canSubmit: false,
        },
        statusFor(error),
      );
    }
  }
}
