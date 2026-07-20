import { BadRequestException } from '@nestjs/common';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface RankedPrice {
  priceListId: string;
  amountCents: number;
}

export function normalizePagination(input: PaginationInput): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function validateVatDefinition(
  rateBasisPoints: number,
  natureCode?: string | null,
): void {
  const normalizedNature = natureCode?.trim().toUpperCase() || null;

  if (rateBasisPoints === 0 && !normalizedNature) {
    throw new BadRequestException({
      code: 'VAT_NATURE_REQUIRED',
      message:
        "Per un'aliquota IVA pari a zero è obbligatorio il codice natura.",
    });
  }

  if (rateBasisPoints > 0 && normalizedNature) {
    throw new BadRequestException({
      code: 'VAT_NATURE_NOT_ALLOWED',
      message:
        'Il codice natura è ammesso soltanto per aliquote IVA pari a zero.',
    });
  }
}

export function validateDateRange(
  startsAt?: Date | null,
  endsAt?: Date | null,
): void {
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new BadRequestException({
      code: 'INVALID_DATE_RANGE',
      message: 'La data di fine deve essere successiva alla data di inizio.',
    });
  }
}

export function buildPriceKey(
  productId: string,
  variantId?: string | null,
): string {
  return variantId
    ? `PRODUCT:${productId}:VARIANT:${variantId}`
    : `PRODUCT:${productId}:BASE`;
}

export function pickEffectivePrice(
  prices: RankedPrice[],
  priceListRank: ReadonlyMap<string, number>,
): RankedPrice | null {
  let selected: RankedPrice | null = null;
  let selectedRank = Number.POSITIVE_INFINITY;

  for (const price of prices) {
    const rank = priceListRank.get(price.priceListId);
    if (rank === undefined) continue;

    if (rank < selectedRank) {
      selected = price;
      selectedRank = rank;
    }
  }

  return selected;
}
