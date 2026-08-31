import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeAuthService } from './ade-auth.service';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';

function statusFor(error: AdeAutomationError): HttpStatus {
  switch (error.code) {
    case 'ADE_CIE_AUTH_BUSY':
      return HttpStatus.CONFLICT;
    case 'ADE_CIE_MFA_TIMEOUT':
    case 'ADE_CIE_CREDENTIALS_REQUIRED':
    case 'ADE_CIE_CREDENTIALS_INVALID':
    case 'ADE_INCARICANTE_NOT_FOUND':
      return HttpStatus.PRECONDITION_FAILED;
    case 'ADE_CIE_ENTRY_NOT_FOUND':
    case 'ADE_CIE_LEVEL2_NOT_FOUND':
    case 'ADE_CIE_USERNAME_FIELD_NOT_FOUND':
    case 'ADE_CIE_PASSWORD_FIELD_NOT_FOUND':
    case 'ADE_CIE_SUBMIT_NOT_FOUND':
    case 'ADE_CIE_MFA_NOT_STARTED':
    case 'ADE_PORTAL_FLOW_MISMATCH':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'ADE_NAVIGATION_FAILED':
      return HttpStatus.BAD_GATEWAY;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function publicMessage(error: AdeAutomationError): string {
  switch (error.code) {
    case 'ADE_CIE_AUTH_BUSY':
      return 'Autenticazione CIE già in corso.';
    case 'ADE_CIE_MFA_TIMEOUT':
      return 'Autorizzazione CIE non completata in tempo.';
    case 'ADE_CIE_CREDENTIALS_REQUIRED':
    case 'ADE_CIE_CREDENTIALS_INVALID':
      return 'Credenziali CIE non configurate o non leggibili.';
    case 'ADE_AUTH_PROFILE_REQUIRED':
    case 'ADE_AUTH_PROFILE_INVALID':
      return 'Profilo di automazione CIE non configurato o non valido.';
    case 'ADE_SESSION_PATH_REQUIRED':
    case 'ADE_SESSION_PATH_INVALID':
      return 'Percorso sessione AdE non configurato correttamente.';
    case 'ADE_INCARICANTE_NOT_FOUND':
      return 'La società configurata non è disponibile tra gli incaricanti AdE.';
    case 'ADE_PORTAL_FLOW_MISMATCH':
      // The browser service uses only static, non-secret step descriptions here.
      // Returning the detail lets operations identify the exact post-MFA step
      // without logging credentials, cookies or selector values.
      return error.message;
    case 'ADE_CIE_ENTRY_NOT_FOUND':
    case 'ADE_CIE_LEVEL2_NOT_FOUND':
    case 'ADE_CIE_USERNAME_FIELD_NOT_FOUND':
    case 'ADE_CIE_PASSWORD_FIELD_NOT_FOUND':
    case 'ADE_CIE_SUBMIT_NOT_FOUND':
    case 'ADE_CIE_MFA_NOT_STARTED':
      return 'Il flusso AdE/CIE non corrisponde al profilo selector configurato.';
    case 'ADE_NAVIGATION_FAILED':
      return 'Navigazione verso il login AdE/CIE non riuscita.';
    case 'ADE_BROWSER_UNAVAILABLE':
      return 'Browser automation non disponibile.';
    case 'ADE_CONFIGURATION_INVALID':
      return 'Configurazione autenticazione AdE incompleta o non valida.';
    default:
      return 'Autenticazione AdE non riuscita.';
  }
}

@Controller('internal/auth')
@UseGuards(AdeInternalAuthGuard)
export class AdeAuthController {
  constructor(private readonly auth: AdeAuthService) {}

  @Get('status')
  status() {
    return this.auth.status();
  }

  @Post('refresh')
  async refresh(@Body() body?: { fiscalId?: unknown }) {
    const rawFiscalId = body?.fiscalId;
    if (
      rawFiscalId !== undefined &&
      (typeof rawFiscalId !== 'string' || !/^\d{11}$/.test(rawFiscalId.trim()))
    ) {
      throw new HttpException(
        {
          code: 'ADE_FISCAL_ID_INVALID',
          category: 'VALIDATION',
          message: 'Il fiscalId deve contenere esattamente 11 cifre.',
          retrySafe: true,
          submitAttempted: false,
          canSubmit: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const fiscalId =
      typeof rawFiscalId === 'string' ? rawFiscalId.trim() : undefined;

    try {
      return await this.auth.refresh(fiscalId);
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
