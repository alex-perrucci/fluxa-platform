import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';

export interface AdeFisconlineCredentials {
  username: string;
  password: string;
  pin: string;
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
export class AdeFisconlineCredentialsService {
  private readonly usernameFile =
    process.env.ADE_FISCONLINE_USERNAME_FILE?.trim() ||
    '/run/fluxa-ade-secrets/fisconline-username';

  private readonly passwordFile =
    process.env.ADE_FISCONLINE_PASSWORD_FILE?.trim() ||
    '/run/fluxa-ade-secrets/fisconline-password';

  private readonly pinFile =
    process.env.ADE_FISCONLINE_PIN_FILE?.trim() ||
    '/run/fluxa-ade-secrets/fisconline-pin';

  readiness(): 'missing' | 'invalid' | 'ready' {
    if (
      !existsSync(this.usernameFile) ||
      !existsSync(this.passwordFile) ||
      !existsSync(this.pinFile)
    ) {
      return 'missing';
    }

    try {
      this.load();
      return 'ready';
    } catch {
      return 'invalid';
    }
  }

  loadForUse(): AdeFisconlineCredentials {
    try {
      return this.load();
    } catch {
      throw new AdeAutomationError(
        'Credenziali Fisconline non configurate o non leggibili.',
        'ADE_CONFIGURATION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private load(): AdeFisconlineCredentials {
    return {
      username: readSecret(this.usernameFile, 'Fisconline username'),
      password: readSecret(this.passwordFile, 'Fisconline password'),
      pin: readSecret(this.pinFile, 'Fisconline PIN'),
    };
  }
}
