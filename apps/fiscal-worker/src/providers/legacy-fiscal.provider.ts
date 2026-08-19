import { Injectable } from '@nestjs/common';
import {
  FiscalProviderService,
  type FiscalExecutionInput,
} from '../fiscal-provider.service';
import type {
  FiscalProviderAdapter,
  FiscalProviderExecutionInput,
  FiscalProviderExecutionResult,
  FiscalProviderName,
} from './fiscal-provider';

const LEGACY_PROVIDERS: readonly FiscalProviderName[] = [
  'MOCK',
  'ACUBE_SMART_RECEIPTS',
  'OPENAPI_SMART_RECEIPTS',
];

@Injectable()
export class LegacyFiscalProviderAdapter implements FiscalProviderAdapter {
  constructor(private readonly legacy: FiscalProviderService) {}

  supports(provider: FiscalProviderName): boolean {
    return LEGACY_PROVIDERS.includes(provider);
  }

  execute(
    input: FiscalProviderExecutionInput,
  ): Promise<FiscalProviderExecutionResult> {
    if (!this.supports(input.provider)) {
      throw new Error(`Legacy provider cannot execute ${input.provider}.`);
    }

    return this.legacy.execute(input as FiscalExecutionInput);
  }
}
