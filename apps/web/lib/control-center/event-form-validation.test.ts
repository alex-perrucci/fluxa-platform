// PHASE_8_TRUE_CONTROL_CENTER
import { describe, expect, it } from 'vitest';
import { parseEventDateWindow } from './event-form-validation';

describe('parseEventDateWindow', () => {
  it('converts a valid local window to ISO strings', () => {
    const result = parseEventDateWindow({
      startsAt: '2026-08-01T20:00',
      endsAt: '2026-08-02T02:00',
      bookingOpensAt: '2026-07-20T10:00',
      bookingClosesAt: '2026-08-01T19:00',
    });

    expect(result.startsAt).toContain('2026-08-01T');
    expect(result.endsAt).toContain('2026-08-02T');
  });

  it('returns a friendly error for an invalid date', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: 'not-a-date',
        endsAt: '2026-08-02T02:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T19:00',
      }),
    ).toThrow('Inizio evento: data e ora non valide.');
  });

  it('rejects an event ending before it starts', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: '2026-08-02T02:00',
        endsAt: '2026-08-01T20:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T19:00',
      }),
    ).toThrow('La fine dell’evento deve essere successiva all’inizio.');
  });

  it('rejects a booking closing time after event start', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: '2026-08-01T20:00',
        endsAt: '2026-08-02T02:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T21:00',
      }),
    ).toThrow(
      'La chiusura delle prenotazioni non può essere successiva all’inizio dell’evento.',
    );
  });
});
