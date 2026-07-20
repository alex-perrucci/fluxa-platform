import {
  formatScaledQuantity,
  renderKitchenTicket,
  renderOrderReceipt,
} from './print-renderer';

describe('print renderer', () => {
  it('formats scaled quantities without floating point noise', () => {
    expect(formatScaledQuantity(1250, 3)).toBe('1.25');
    expect(formatScaledQuantity(2, 0)).toBe('2');
  });

  it('renders kitchen snapshots', () => {
    const output = renderKitchenTicket({
      ticketNumber: 'KIT-1',
      stationName: 'Cucina',
      orderNumber: 'ORD-1',
      tableCode: 'T01',
      queuedAt: new Date('2026-07-20T18:00:00.000Z'),
      items: [
        {
          quantityAmount: 2,
          quantityScale: 0,
          name: 'Panino',
          note: 'Senza sale',
        },
      ],
    });
    expect(output.includes('2 x Panino')).toBe(true);
    expect(output.includes('NOTA: Senza sale')).toBe(true);
  });

  it('marks order receipts as non fiscal', () => {
    const output = renderOrderReceipt({
      orderNumber: 'ORD-1',
      businessDate: '2026-07-20',
      currency: 'EUR',
      items: [],
      subtotalCents: 1000,
      discountCents: 0,
      totalCents: 1000,
      taxTotalCents: 91,
    });
    expect(output.includes('NON VALIDO AI FINI FISCALI')).toBe(true);
  });
});
