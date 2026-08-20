import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

export interface AdeCieCredentials {
  username: string;
  password: string;
}

function readSecret(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} file missing`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file`);
  }
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${label} is empty`);
  return value;
}

@Injectable()
export class AdeCieCredentialsService {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  readiness(): 'missing' | 'invalid' | 'ready' {
    const { cieUsernameFile, ciePasswordFile } = this.config.read();
    if (!cieUsernameFile || !ciePasswordFile) return 'missing';
    try {
      readSecret(cieUsernameFile, 'CIE username');
      readSecret(ciePasswordFile, 'CIE password');
      return 'ready';
    } catch {
      return 'invalid';
    }
  }

  loadForUse(): AdeCieCredentials {
    const { cieUsernameFile, ciePasswordFile } = this.config.read();
    if (!cieUsernameFile || !ciePasswordFile) {
      throw new AdeAutomationError(
        'Credenziali CIE non configurate.',
        'ADE_CIE_CREDENTIALS_REQUIRED',
        'AUTH_REQUIRED',
        false,
      );
    }
    try {
      return {
        username: readSecret(cieUsernameFile, 'CIE username'),
        password: readSecret(ciePasswordFile, 'CIE password'),
      };
    } catch {
      throw new AdeAutomationError(
        'Credenziali CIE non leggibili.',
        'ADE_CIE_CREDENTIALS_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }
}
