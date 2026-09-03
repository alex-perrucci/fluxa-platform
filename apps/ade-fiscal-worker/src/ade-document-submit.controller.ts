import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDocumentOperationLockService } from './ade-document-operation-lock.service';
import { AdeDocumentSubmitService } from './ade-document-submit.service';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';

function statusFor(error: AdeAutomationError): HttpStatus {
  switch (error.code) {
    case 'ADE_DOCUMENT_INPUT_INVALID':
      return HttpStatus.BAD_REQUEST;
    case 'ADE_DOCUMENT_SUBMIT_BUSY':
    case 'ADE_DOCUMENT_SUBMIT_DUPLICATE_OPERATION':
      return HttpStatus.CONFLICT;
    case 'ADE_SUBMIT_DISABLED':
    case 'ADE_SESSION_REQUIRED':
    case 'ADE_SESSION_INVALID':
      return HttpStatus.PRECONDITION_FAILED;
    case 'ADE_DOCUMENT_FLOW_MISMATCH':
    case 'ADE_DOCUMENT_VERIFY_MISMATCH':
    case 'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'ADE_DOCUMENT_SUBMIT_UNKNOWN':
    case 'ADE_NAVIGATION_FAILED':
      return HttpStatus.BAD_GATEWAY;
    case 'ADE_UPSTREAM_UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function publicMessage(error: AdeAutomationError): string {
  switch (error.code) {
    case 'ADE_DOCUMENT_INPUT_INVALID':
      return error.message;
    case 'ADE_DOCUMENT_SUBMIT_BUSY':
      return 'Un submit AdE è già in corso.';
    case 'ADE_DOCUMENT_SUBMIT_DUPLICATE_OPERATION':
      return 'Il documento risulta già tentato dal worker AdE.';
    case 'ADE_SUBMIT_DISABLED':
      return 'Submit fiscale AdE disabilitato.';
    case 'ADE_SESSION_REQUIRED':
      return 'Sessione AdE richiesta.';
    case 'ADE_SESSION_INVALID':
      return 'Sessione AdE non valida.';
    case 'ADE_DOCUMENT_FLOW_MISMATCH':
    case 'ADE_DOCUMENT_VERIFY_MISMATCH':
    case 'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND':
      return error.message;
    case 'ADE_DOCUMENT_SUBMIT_UNKNOWN':
      return 'Procedi può essere stato attivato, ma l’esito fiscale non è verificabile automaticamente.';
    case 'ADE_CONFIGURATION_INVALID':
      return 'Configurazione AdE incompleta o non valida.';
    case 'ADE_BROWSER_UNAVAILABLE':
      return 'Browser automation non disponibile.';
    case 'ADE_NAVIGATION_FAILED':
      return 'Navigazione AdE non riuscita.';
    case 'ADE_UPSTREAM_UNAVAILABLE':
      return 'Servizio Documento Commerciale AdE temporaneamente non disponibile.';
    default:
      return 'Submit documento AdE non riuscito.';
  }
}

@Controller('internal/document')
@UseGuards(AdeInternalAuthGuard)
export class AdeDocumentSubmitController {
  constructor(
    private readonly submit: AdeDocumentSubmitService,
    private readonly operationLock: AdeDocumentOperationLockService,
  ) {}

  @Post('submit')
  async run(@Body() body: unknown) {
    const release = this.operationLock.tryAcquire();
    if (!release) {
      throw new HttpException(
        {
          code: 'ADE_DOCUMENT_SUBMIT_BUSY',
          category: 'CONFIGURATION',
          message: 'Un’altra operazione documento AdE è già in corso.',
          retrySafe: true,
          submitAttempted: false,
          canSubmit: false,
        },
        HttpStatus.CONFLICT,
      );
    }

    try {
      return await this.submit.run(body);
    } catch (error) {
      if (!(error instanceof AdeAutomationError)) throw error;
      throw new HttpException(
        {
          code: error.code,
          category: error.category,
          message: publicMessage(error),
          retrySafe: error.retrySafe,
          submitAttempted: error.submitAttempted,
          canSubmit: false,
        },
        statusFor(error),
      );
    } finally {
      release();
    }
  }
}
