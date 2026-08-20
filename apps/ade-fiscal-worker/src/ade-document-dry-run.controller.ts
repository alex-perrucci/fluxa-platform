import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDocumentDryRunService } from './ade-document-dry-run.service';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';

function statusFor(error: AdeAutomationError): HttpStatus {
  switch (error.code) {
    case 'ADE_DOCUMENT_INPUT_INVALID':
      return HttpStatus.BAD_REQUEST;
    case 'ADE_DOCUMENT_DRY_RUN_BUSY':
      return HttpStatus.CONFLICT;
    case 'ADE_SESSION_REQUIRED':
    case 'ADE_SESSION_INVALID':
      return HttpStatus.PRECONDITION_FAILED;
    case 'ADE_DOCUMENT_FLOW_MISMATCH':
    case 'ADE_DOCUMENT_VERIFY_MISMATCH':
    case 'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'ADE_NAVIGATION_FAILED':
      return HttpStatus.BAD_GATEWAY;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function publicMessage(error: AdeAutomationError): string {
  switch (error.code) {
    case 'ADE_DOCUMENT_INPUT_INVALID':
      return error.message;
    case 'ADE_DOCUMENT_DRY_RUN_BUSY':
      return 'Un document dry-run AdE è già in corso.';
    case 'ADE_SESSION_REQUIRED':
      return 'Sessione AdE richiesta.';
    case 'ADE_SESSION_INVALID':
      return 'Sessione AdE non valida.';
    case 'ADE_DOCUMENT_FLOW_MISMATCH':
      return 'Il flusso Documento Commerciale AdE non corrisponde al profilo atteso.';
    case 'ADE_DOCUMENT_VERIFY_MISMATCH':
      return 'La schermata Verifica dati non corrisponde al documento atteso.';
    case 'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND':
      return 'Boundary finale Procedi/Annulla non trovato.';
    case 'ADE_DRY_RUN_DISABLED':
      return 'Dry-run AdE disabilitato.';
    case 'ADE_CONFIGURATION_INVALID':
      return 'Configurazione AdE incompleta o non valida.';
    case 'ADE_BROWSER_UNAVAILABLE':
      return 'Browser automation non disponibile.';
    case 'ADE_NAVIGATION_FAILED':
      return 'Navigazione AdE non riuscita.';
    default:
      return 'Document dry-run AdE non riuscito.';
  }
}

@Controller('internal/document')
@UseGuards(AdeInternalAuthGuard)
export class AdeDocumentDryRunController {
  constructor(private readonly dryRun: AdeDocumentDryRunService) {}

  @Post('dry-run')
  async run(@Body() body: unknown) {
    try {
      return await this.dryRun.run(body);
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
