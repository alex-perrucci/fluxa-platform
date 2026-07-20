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
  orderNumber: string;
  checkoutId: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  payments: Array<{
    method: string;
    amountCents: number;
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
    '*** DOCUMENTO NON FISCALE ***',
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
    '*** NON VALIDO AI FINI FISCALI ***',
    '',
  );
  return lines.join('\n');
}

export function renderPaymentReceipt(input: PaymentReceiptPrintInput): string {
  const lines = [
    '*** RIEPILOGO PAGAMENTO ***',
    `Ordine: ${input.orderNumber}`,
    `Checkout: ${input.checkoutId}`,
    '------------------------',
  ];
  for (const payment of input.payments) {
    lines.push(
      `${payment.method}: ${money(payment.amountCents, input.currency)} [${payment.status}]`,
    );
  }
  lines.push(
    '------------------------',
    `Totale: ${money(input.totalCents, input.currency)}`,
    `Pagato: ${money(input.paidCents, input.currency)}`,
    `Resto: ${money(input.changeCents, input.currency)}`,
    '*** NON VALIDO AI FINI FISCALI ***',
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
