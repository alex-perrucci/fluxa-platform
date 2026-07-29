// PHASE_9_PUBLIC_BOOKING
import { describe, expect, it } from 'vitest';
import {
  bookingStateLabel,
  formatPublicMoney,
  reservationStatusLabel,
} from './format';

describe('public booking formatting', () => {
  it('formats euro cents with the Italian locale', () => {
    expect(formatPublicMoney(1250, 'EUR')).toContain('12,50');
  });

  it('labels an open booking window', () => {
    expect(bookingStateLabel('OPEN')).toBe('Prenotazioni aperte');
  });

  it('labels pending payments clearly', () => {
    expect(reservationStatusLabel('PENDING_PAYMENT')).toBe(
      'In attesa di pagamento',
    );
  });
});
