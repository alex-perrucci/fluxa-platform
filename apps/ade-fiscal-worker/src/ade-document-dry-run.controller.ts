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
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

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
    case 'ADE_DOCUMENT_VERIFY_MISMATCH':
    case 'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND':
      // Document-browser messages are static, step-specific strings and do not
      // contain credentials, cookies, selectors or page content. Returning them
      // here makes live selector debugging possible without exposing secrets.
      return error.message;
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
  constructor(
    private readonly dryRun: AdeDocumentDryRunService,
    private readonly config: AdeRuntimeConfigService,
  ) {}

  @Post('dry-run')
  async run(@Body() body: unknown) {
    try {
      return await this.dryRun.run(body);
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post('submit-preflight')
  async submitPreflight(@Body() body: unknown) {
    try {
      const result = await this.dryRun.run(body);
      return {
        status: 'SUBMIT_PREFLIGHT_READY' as const,
        submitEnabled: this.config.read().submitEnabled,
        finalUrl: result.finalUrl,
        confirmationBoundarySeen: result.confirmationBoundarySeen,
        cancelledAtBoundary: result.cancelledAtBoundary,
        itemCount: result.itemCount,
        grossTotalCents: result.grossTotalCents,
        paymentTotalCents: result.paymentTotalCents,
        readyForSubmit: true as const,
        submitAttempted: false as const,
        canSubmit: false as const,
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
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
