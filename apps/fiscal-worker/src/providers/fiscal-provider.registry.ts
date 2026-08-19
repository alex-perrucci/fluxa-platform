import { Injectable } from '@nestjs/common';
import { AdeWebFiscalProvider } from './ade-web-fiscal.provider';
import type {
  FiscalProviderAdapter,
  FiscalProviderExecutionInput,
  FiscalProviderExecutionResult,
} from './fiscal-provider';
import { LegacyFiscalProviderAdapter } from './legacy-fiscal.provider';

@Injectable()
export class FiscalProviderRegistry {
  private readonly adapters: readonly FiscalProviderAdapter[];

  constructor(
    legacy: LegacyFiscalProviderAdapter,
    adeWeb: AdeWebFiscalProvider,
  ) {
    this.adapters = [adeWeb, legacy];
  }

  execute(
    input: FiscalProviderExecutionInput,
  ): Promise<FiscalProviderExecutionResult> {
    const adapter = this.adapters.find((candidate) =>
      candidate.supports(input.provider),
    );

    if (!adapter) {
      return Promise.reject(
        new Error(`No fiscal provider registered for ${input.provider}.`),
      );
    }

    return adapter.execute(input);
  }
}
