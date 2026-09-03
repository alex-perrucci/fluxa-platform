import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDcoHttpClient } from './ade-dco-http.client';
import { AdeInternalAuthGuard } from './ade-internal-auth.guard';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

function artifactStatus(error: AdeAutomationError): HttpStatus {
  switch (error.code) {
    case 'ADE_ARTIFACT_INPUT_INVALID':
      return HttpStatus.BAD_REQUEST;
    case 'ADE_ARTIFACT_NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'ADE_SESSION_REQUIRED':
    case 'ADE_SESSION_INVALID':
      return HttpStatus.PRECONDITION_FAILED;
    case 'ADE_UPSTREAM_UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
}

@Controller('internal/document')
@UseGuards(AdeInternalAuthGuard)
export class AdeDocumentArtifactController {
  constructor(
    private readonly http: AdeDcoHttpClient,
    private readonly session: AdeSessionService,
    private readonly config: AdeRuntimeConfigService,
  ) {}

  @Get('artifact')
  async download(
    @Query('fiscalId') rawFiscalId: string | undefined,
    @Query('externalId') rawExternalId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const fiscalId = rawFiscalId?.trim() ?? '';
    const externalId = rawExternalId?.trim() ?? '';
    if (!/^\d{11}$/.test(fiscalId) || !externalId) {
      throw new HttpException(
        {
          code: 'ADE_ARTIFACT_INPUT_INVALID',
          message: 'fiscalId o externalId non valido.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const artifact = await this.http.getOfficialArtifact({
        storageStatePath: this.session.storageStatePathForUse(fiscalId),
        externalId,
        timeoutMs: this.config.read().navigationTimeoutMs,
      });
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `inline; filename="documento-commerciale-ade-${externalId}.pdf"`,
      );
      response.setHeader('Content-Length', String(artifact.bytes.length));
      response.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(artifact.bytes);
    } catch (error) {
      if (!(error instanceof AdeAutomationError)) throw error;
      throw new HttpException(
        {
          code: error.code,
          message: error.message,
          retrySafe: error.retrySafe,
        },
        artifactStatus(error),
      );
    }
  }
}
