export interface PrintLineItem {
  quantityAmount: number;
  quantityScale: number;
  name: string;
  variantName?: string | null;
  note?: string | null;
  totalCents?: number;
}

export interface KitchenTicketPrintInput {
  ticketNumber: string;
  stationName: string;
  orderNumber: string;
  tableCode?: string | null;
  queuedAt: Date;
  items: PrintLineItem[];
}

export interface OrderReceiptPrintInput {
  orderNumber: string;
  businessDate: string;
  currency: string;
  items: PrintLineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  taxTotalCents: number;
}

export interface PaymentReceiptPrintInput {
  merchant: {
    legalName: string;
    tradeName?: string | null;
    vatNumber: string;
    taxCode?: string | null;
  };
  location: {
    name: string;
    addressLine1: string;
    addressLine2?: string | null;
    postalCode: string;
    city: string;
    province?: string | null;
    countryCode: string;
    timezone: string;
  };
  orderNumber: string;
  businessDate: string;
  completedAt?: Date | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  taxTotalCents: number;
  paidCents: number;
  changeCents: number;
  items: Array<{
    quantityAmount: number;
    quantityScale: number;
    name: string;
    variantName?: string | null;
    note?: string | null;
    unitPriceCents: number;
    grossTotalCents: number;
    allocatedDiscountCents: number;
    finalGrossCents: number;
    vatRateBasisPoints: number;
    vatNatureCode?: string | null;
  }>;
  vatSummaries: Array<{
    vatRateBasisPoints: number;
    vatNatureCode?: string | null;
    grossCents: number;
    netCents: number;
    taxCents: number;
  }>;
  payments: Array<{
    method: string;
    amountCents: number;
    tenderedCents?: number | null;
    changeCents: number;
    status: string;
  }>;
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function formatScaledQuantity(amount: number, scale: number): string {
  if (scale <= 0) return String(amount);
  const divisor = 10 ** scale;
  return (amount / divisor)
    .toFixed(scale)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function itemName(item: PrintLineItem): string {
  return item.variantName ? `${item.name} - ${item.variantName}` : item.name;
}

function paymentLabel(method: string): string {
  switch (method) {
    case 'CASH':
      return 'CONTANTI';
    case 'CARD':
      return 'CARTA';
    case 'OTHER':
      return 'ALTRO';
    default:
      return method;
  }
}

function vatLabel(rateBasisPoints: number, natureCode?: string | null): string {
  if (natureCode) return natureCode;
  const rate = rateBasisPoints / 100;
  return `IVA ${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2)}%`;
}

function receiptDate(date: Date | null | undefined, timezone: string): string {
  const value = date ?? new Date();
  try {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

export function renderKitchenTicket(input: KitchenTicketPrintInput): string {
  const lines = [
    '*** COMANDA CUCINA ***',
    `Postazione: ${input.stationName}`,
    `Comanda: ${input.ticketNumber}`,
    `Ordine: ${input.orderNumber}`,
    input.tableCode ? `Tavolo: ${input.tableCode}` : 'Tavolo: -',
    `Ora: ${input.queuedAt.toISOString()}`,
    '------------------------',
  ];

  for (const item of input.items) {
    lines.push(
      `${formatScaledQuantity(item.quantityAmount, item.quantityScale)} x ${itemName(item)}`,
    );
    if (item.note) lines.push(`  NOTA: ${item.note}`);
  }

  lines.push('------------------------', '');
  return lines.join('\n');
}

export function renderOrderReceipt(input: OrderReceiptPrintInput): string {
  const lines = [
    '*** RIEPILOGO ORDINE ***',
    `Ordine: ${input.orderNumber}`,
    `Data: ${input.businessDate}`,
    '------------------------',
  ];

  for (const item of input.items) {
    const total = item.totalCents ?? 0;
    lines.push(
      `${formatScaledQuantity(item.quantityAmount, item.quantityScale)} x ${itemName(item)}  ${money(total, input.currency)}`,
    );
    if (item.note) lines.push(`  ${item.note}`);
  }

  lines.push(
    '------------------------',
    `Subtotale: ${money(input.subtotalCents, input.currency)}`,
    `Sconti: ${money(input.discountCents, input.currency)}`,
    `IVA inclusa: ${money(input.taxTotalCents, input.currency)}`,
    `TOTALE: ${money(input.totalCents, input.currency)}`,
    '',
  );
  return lines.join('\n');
}

export function renderPaymentReceipt(input: PaymentReceiptPrintInput): string {
  const merchantName =
    input.merchant.tradeName?.trim() || input.merchant.legalName;
  const locationLine = [
    `${input.location.postalCode} ${input.location.city}`.trim(),
    input.location.province ? `(${input.location.province})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [
    `*** ${merchantName.toUpperCase()} ***`,
    input.merchant.tradeName &&
    input.merchant.tradeName !== input.merchant.legalName
      ? input.merchant.legalName
      : '',
    input.location.name,
    input.location.addressLine1,
    input.location.addressLine2 ?? '',
    `${locationLine} ${input.location.countryCode}`.trim(),
    `P.IVA ${input.merchant.vatNumber}`,
    input.merchant.taxCode ? `C.F. ${input.merchant.taxCode}` : '',
    '------------------------',
    '*** DOCUMENTO COMMERCIALE ***',
    'DI VENDITA O PRESTAZIONE',
    `Data/Ora: ${receiptDate(input.completedAt, input.location.timezone)}`,
    `Documento: ${input.orderNumber}`,
    '------------------------',
  ].filter((line) => line.length > 0);

  for (const item of input.items) {
    const name = item.variantName
      ? `${item.name} - ${item.variantName}`
      : item.name;
    const quantity = formatScaledQuantity(
      item.quantityAmount,
      item.quantityScale,
    );
    lines.push(name);
    lines.push(
      `${quantity} x ${money(item.unitPriceCents, input.currency)}  ${money(item.grossTotalCents, input.currency)}`,
    );
    if (item.allocatedDiscountCents > 0) {
      lines.push(
        `  Sconto -${money(item.allocatedDiscountCents, input.currency)}`,
      );
    }
    lines.push(
      `  ${vatLabel(item.vatRateBasisPoints, item.vatNatureCode)}  ${money(item.finalGrossCents, input.currency)}`,
    );
    if (item.note) lines.push(`  Nota: ${item.note}`);
  }

  lines.push('------------------------');
  if (input.discountCents > 0) {
    lines.push(
      `Subtotale: ${money(input.subtotalCents, input.currency)}`,
      `Sconti: -${money(input.discountCents, input.currency)}`,
    );
  }
  lines.push(
    `*** TOTALE ${money(input.totalCents, input.currency)} ***`,
    `di cui IVA ${money(input.taxTotalCents, input.currency)}`,
    '------------------------',
    'PAGAMENTO',
  );

  for (const payment of input.payments.filter(
    (entry) => entry.status === 'CAPTURED',
  )) {
    lines.push(
      `${paymentLabel(payment.method)} ${money(payment.amountCents, input.currency)}`,
    );
    if (payment.method === 'CASH' && payment.tenderedCents != null) {
      lines.push(`  Ricevuto ${money(payment.tenderedCents, input.currency)}`);
      if (payment.changeCents > 0) {
        lines.push(`  Resto ${money(payment.changeCents, input.currency)}`);
      }
    }
  }
  if (
    input.changeCents > 0 &&
    !input.payments.some((payment) => payment.changeCents > 0)
  ) {
    lines.push(`RESTO ${money(input.changeCents, input.currency)}`);
  }

  if (input.vatSummaries.length > 0) {
    lines.push('------------------------', 'RIEPILOGO IVA');
    for (const summary of input.vatSummaries) {
      lines.push(
        `${vatLabel(summary.vatRateBasisPoints, summary.vatNatureCode)} ` +
          `Imp. ${money(summary.netCents, input.currency)} ` +
          `IVA ${money(summary.taxCents, input.currency)}`,
      );
    }
  }

  lines.push(
    '------------------------',
    `Totale pagato ${money(input.paidCents, input.currency)}`,
    'Grazie e arrivederci',
    '',
  );
  return lines.join('\n');
}

export function renderTestPage(input: {
  printerName: string;
  code: string;
  deviceId: string;
  generatedAt: Date;
}): string {
  return [
    '*** FLUXA TEST STAMPA ***',
    `Stampante: ${input.printerName}`,
    `Codice: ${input.code}`,
    `Dispositivo: ${input.deviceId}`,
    `Generato: ${input.generatedAt.toISOString()}`,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '0123456789',
    '',
  ].join('\n');
}
