import { ConflictException } from '@nestjs/common';

const ACUBE_RATE_CODES = new Map<number, string>([
  [400, '4'],
  [500, '5'],
  [640, '6.4'],
  [700, '7'],
  [730, '7.3'],
  [750, '7.5'],
  [765, '7.65'],
  [795, '7.95'],
  [830, '8.3'],
  [850, '8.5'],
  [880, '8.8'],
  [950, '9.5'],
  [1000, '10'],
  [1230, '12.3'],
  [2200, '22'],
]);

export function assertOrderFiscalizable(input: {
  status: string;
  totalCents: number;
  itemCount: number;
}): void {
  if (input.status !== 'PAID') {
    throw new ConflictException({
      code: 'ORDER_NOT_PAID',
      message: "L'ordine deve essere pagato prima della fiscalizzazione.",
    });
  }
  if (input.totalCents <= 0 || input.itemCount <= 0) {
    throw new ConflictException({
      code: 'ORDER_NOT_FISCALIZABLE',
      message: "L'ordine deve contenere righe e un totale positivo.",
    });
  }
}

export function acubeVatRateCode(
  basisPoints: number,
  natureCode?: string | null,
): string {
  if (natureCode) {
    const normalized = natureCode.trim().toUpperCase();
    const root = normalized.match(/^N[1-6]/)?.[0];
    if (root) return root;
  }
  const code = ACUBE_RATE_CODES.get(basisPoints);
  if (!code) {
    throw new ConflictException({
      code: 'FISCAL_VAT_RATE_NOT_SUPPORTED',
      message: `Aliquota IVA non supportata dal provider fiscale: ${basisPoints}.`,
    });
  }
  return code;
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function scaledQuantity(amount: number, scale: number): string {
  if (scale <= 0) return amount.toFixed(2);
  return (amount / 10 ** scale).toFixed(Math.max(2, scale));
}

export function allocateFiscalPayments(
  totalCents: number,
  payments: Array<{ method: string; amountCents: number }>,
): { cashCents: number; electronicCents: number } {
  let cashCents = 0;
  let electronicCents = 0;
  for (const payment of payments) {
    if (payment.method === 'CASH') cashCents += payment.amountCents;
    else electronicCents += payment.amountCents;
  }
  if (cashCents + electronicCents !== totalCents) {
    throw new ConflictException({
      code: 'FISCAL_PAYMENT_TOTAL_MISMATCH',
      message: 'I pagamenti acquisiti non coincidono con il totale ordine.',
    });
  }
  return { cashCents, electronicCents };
}
