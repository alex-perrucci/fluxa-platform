import { Injectable } from '@nestjs/common';

export interface RefundProviderInput {
  refundId: string;
  paymentId: string;
  method: 'CASH' | 'CARD';
  provider: 'CASH' | 'MANUAL_TERMINAL' | 'EXTERNAL_TERMINAL';
  amountCents: number;
  currency: string;
  originalProviderReference: string | null;
  requestedProviderReference: string | null;
  providerEventId: string | null;
}

export interface RefundProviderResult {
  status: 'SUCCEEDED' | 'PENDING';
  providerReference: string | null;
  providerEventId: string | null;
}

export interface RefundProviderAdapter {
  supports(input: RefundProviderInput): boolean;
  refund(input: RefundProviderInput): Promise<RefundProviderResult>;
}

class CashRefundAdapter implements RefundProviderAdapter {
  supports(input: RefundProviderInput): boolean {
    return input.method === 'CASH' && input.provider === 'CASH';
  }

  async refund(input: RefundProviderInput): Promise<RefundProviderResult> {
    return {
      status: 'SUCCEEDED',
      providerReference: `CASH-REFUND-${input.refundId}`,
      providerEventId: input.providerEventId,
    };
  }
}

class TerminalRefundAdapter implements RefundProviderAdapter {
  supports(input: RefundProviderInput): boolean {
    return input.method === 'CARD' && input.provider !== 'CASH';
  }

  async refund(input: RefundProviderInput): Promise<RefundProviderResult> {
    return {
      status: input.provider === 'EXTERNAL_TERMINAL' ? 'PENDING' : 'SUCCEEDED',
      providerReference:
        input.requestedProviderReference ??
        input.originalProviderReference ??
        `CARD-REFUND-${input.refundId}`,
      providerEventId: input.providerEventId,
    };
  }
}

@Injectable()
export class RefundProviderService {
  private readonly adapters: RefundProviderAdapter[] = [
    new CashRefundAdapter(),
    new TerminalRefundAdapter(),
  ];

  async refund(input: RefundProviderInput): Promise<RefundProviderResult> {
    const adapter = this.adapters.find((candidate) => candidate.supports(input));
    if (!adapter) {
      throw new Error(
        `No refund adapter for ${input.method}/${input.provider}.`,
      );
    }
    return adapter.refund(input);
  }
}
