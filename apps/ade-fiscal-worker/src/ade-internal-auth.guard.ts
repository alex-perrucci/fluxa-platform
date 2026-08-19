import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

function tokensMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

@Injectable()
export class AdeInternalAuthGuard implements CanActivate {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.read().internalToken;
    if (!expected) {
      throw new ServiceUnavailableException({
        code: 'ADE_INTERNAL_AUTH_REQUIRED',
        message: 'Il token interno del worker AdE non è configurato.',
      });
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.header('x-fluxa-internal-token')?.trim() ?? '';
    if (!received || !tokensMatch(expected, received)) {
      throw new UnauthorizedException({
        code: 'ADE_INTERNAL_AUTH_REQUIRED',
        message: 'Autenticazione interna non valida.',
      });
    }
    return true;
  }
}
