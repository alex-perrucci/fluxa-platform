export type CalculationAdjustmentType = 'FIXED' | 'PERCENTAGE';

export interface CalculationItem {
  id: string;
  grossCents: number;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
}

export interface CalculationAdjustment {
  id: string;
  type: CalculationAdjustmentType;
  value: number;
}

export interface CalculatedLine {
  id: string;
  allocatedDiscountCents: number;
  finalGrossCents: number;
  finalNetCents: number;
  finalTaxCents: number;
}

export interface CalculatedAdjustment {
  id: string;
  appliedCents: number;
}

export interface VatSummary {
  key: string;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
  grossCents: number;
  netCents: number;
  taxCents: number;
}

export interface OrderCalculation {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  netTotalCents: number;
  taxTotalCents: number;
  lines: CalculatedLine[];
  adjustments: CalculatedAdjustment[];
  vatSummaries: VatSummary[];
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new RangeError(`${label} exceeds the safe integer range.`);
  }

  return Number(value);
}

function roundPositiveRatio(
  numerator: bigint,
  denominator: bigint,
  label: string,
): number {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError(`${label} requires a positive ratio.`);
  }

  return toSafeNumber((numerator + denominator / 2n) / denominator, label);
}

export function calculateGrossFromQuantity(
  unitPriceCents: number,
  quantityAmount: number,
  quantityScale: number,
): number {
  assertSafeInteger(unitPriceCents, 'unitPriceCents');
  assertSafeInteger(quantityAmount, 'quantityAmount');
  assertSafeInteger(quantityScale, 'quantityScale');

  if (unitPriceCents < 0) {
    throw new RangeError('unitPriceCents cannot be negative.');
  }

  if (quantityAmount <= 0) {
    throw new RangeError('quantityAmount must be greater than zero.');
  }

  if (quantityScale < 0 || quantityScale > 6) {
    throw new RangeError('quantityScale must be between 0 and 6.');
  }

  const divisor = 10n ** BigInt(quantityScale);

  return roundPositiveRatio(
    BigInt(unitPriceCents) * BigInt(quantityAmount),
    divisor,
    'grossCents',
  );
}

export function calculateVatFromGross(
  grossCents: number,
  vatRateBasisPoints: number,
): { netCents: number; taxCents: number } {
  assertSafeInteger(grossCents, 'grossCents');
  assertSafeInteger(vatRateBasisPoints, 'vatRateBasisPoints');

  if (grossCents < 0) {
    throw new RangeError('grossCents cannot be negative.');
  }

  if (vatRateBasisPoints < 0 || vatRateBasisPoints > 10000) {
    throw new RangeError('vatRateBasisPoints must be between 0 and 10000.');
  }

  if (vatRateBasisPoints === 0 || grossCents === 0) {
    return { netCents: grossCents, taxCents: 0 };
  }

  const taxCents = roundPositiveRatio(
    BigInt(grossCents) * BigInt(vatRateBasisPoints),
    BigInt(10000 + vatRateBasisPoints),
    'taxCents',
  );

  return {
    netCents: grossCents - taxCents,
    taxCents,
  };
}

function adjustmentAmount(
  subtotalCents: number,
  adjustment: CalculationAdjustment,
): number {
  assertSafeInteger(adjustment.value, 'adjustment.value');

  if (adjustment.type === 'FIXED') {
    if (adjustment.value <= 0) {
      throw new RangeError('Fixed discounts must be greater than zero.');
    }

    return adjustment.value;
  }

  if (adjustment.value <= 0 || adjustment.value > 10000) {
    throw new RangeError(
      'Percentage discounts must be between 1 and 10000 basis points.',
    );
  }

  return roundPositiveRatio(
    BigInt(subtotalCents) * BigInt(adjustment.value),
    10000n,
    'percentageDiscountCents',
  );
}

function allocateDiscount(
  items: CalculationItem[],
  subtotalCents: number,
  discountCents: number,
): Map<string, number> {
  const result = new Map<string, number>();

  if (discountCents === 0 || subtotalCents === 0) {
    for (const item of items) result.set(item.id, 0);
    return result;
  }

  const rows = items.map((item) => {
    const numerator = BigInt(item.grossCents) * BigInt(discountCents);
    const divisor = BigInt(subtotalCents);
    const base = toSafeNumber(numerator / divisor, 'allocatedDiscountCents');

    return {
      id: item.id,
      base,
      remainder: numerator % divisor,
    };
  });

  let allocated = rows.reduce((sum, row) => sum + row.base, 0);
  let remaining = discountCents - allocated;

  rows.sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.id.localeCompare(right.id);
    }

    return left.remainder > right.remainder ? -1 : 1;
  });

  for (let index = 0; index < rows.length && remaining > 0; index++) {
    rows[index].base += 1;
    remaining -= 1;
    allocated += 1;
  }

  if (allocated !== discountCents || remaining !== 0) {
    throw new RangeError('Unable to allocate the full discount.');
  }

  for (const row of rows) result.set(row.id, row.base);
  return result;
}

export function calculateOrderTotals(
  items: CalculationItem[],
  adjustments: CalculationAdjustment[],
): OrderCalculation {
  const itemIds = new Set<string>();
  let subtotalCents = 0;

  for (const item of items) {
    if (itemIds.has(item.id)) {
      throw new RangeError(`Duplicate calculation item: ${item.id}`);
    }

    itemIds.add(item.id);
    assertSafeInteger(item.grossCents, 'item.grossCents');
    assertSafeInteger(item.vatRateBasisPoints, 'item.vatRateBasisPoints');

    if (item.grossCents <= 0) {
      throw new RangeError('Every order item must have a positive gross.');
    }

    subtotalCents += item.grossCents;
    assertSafeInteger(subtotalCents, 'subtotalCents');
  }

  const calculatedAdjustments = adjustments.map((adjustment) => ({
    id: adjustment.id,
    appliedCents: adjustmentAmount(subtotalCents, adjustment),
  }));

  const discountCents = calculatedAdjustments.reduce(
    (sum, adjustment) => sum + adjustment.appliedCents,
    0,
  );

  assertSafeInteger(discountCents, 'discountCents');

  if (discountCents > subtotalCents) {
    throw new RangeError('DISCOUNT_EXCEEDS_SUBTOTAL');
  }

  const allocations = allocateDiscount(items, subtotalCents, discountCents);
  const vatMap = new Map<string, VatSummary>();

  const lines = items.map((item) => {
    const allocatedDiscountCents = allocations.get(item.id) ?? 0;
    const finalGrossCents = item.grossCents - allocatedDiscountCents;
    const vat = calculateVatFromGross(finalGrossCents, item.vatRateBasisPoints);
    const key = `${item.vatRateBasisPoints}:${item.vatNatureCode ?? ''}`;
    const current = vatMap.get(key) ?? {
      key,
      vatRateBasisPoints: item.vatRateBasisPoints,
      vatNatureCode: item.vatNatureCode,
      grossCents: 0,
      netCents: 0,
      taxCents: 0,
    };

    current.grossCents += finalGrossCents;
    current.netCents += vat.netCents;
    current.taxCents += vat.taxCents;
    vatMap.set(key, current);

    return {
      id: item.id,
      allocatedDiscountCents,
      finalGrossCents,
      finalNetCents: vat.netCents,
      finalTaxCents: vat.taxCents,
    };
  });

  const totalCents = subtotalCents - discountCents;
  const vatSummaries = Array.from(vatMap.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const netTotalCents = vatSummaries.reduce(
    (sum, summary) => sum + summary.netCents,
    0,
  );
  const taxTotalCents = vatSummaries.reduce(
    (sum, summary) => sum + summary.taxCents,
    0,
  );

  if (netTotalCents + taxTotalCents !== totalCents) {
    throw new RangeError('VAT totals do not reconcile with order total.');
  }

  return {
    subtotalCents,
    discountCents,
    totalCents,
    netTotalCents,
    taxTotalCents,
    lines,
    adjustments: calculatedAdjustments,
    vatSummaries,
  };
}
