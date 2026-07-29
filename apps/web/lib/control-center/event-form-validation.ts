// PHASE_8_TRUE_CONTROL_CENTER

export interface EventDateWindowInput {
  startsAt: FormDataEntryValue | null;
  endsAt: FormDataEntryValue | null;
  bookingOpensAt: FormDataEntryValue | null;
  bookingClosesAt: FormDataEntryValue | null;
}

export interface EventDateWindow {
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
}

function parseRequiredLocalDateTime(
  value: FormDataEntryValue | null,
  label: string,
): Date {
  const raw = typeof value === 'string' ? value.trim() : '';

  if (!raw) {
    throw new Error(`${label}: inserisci data e ora.`);
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}: data e ora non valide.`);
  }

  return parsed;
}

export function parseEventDateWindow(
  input: EventDateWindowInput,
): EventDateWindow {
  const startsAt = parseRequiredLocalDateTime(input.startsAt, 'Inizio evento');
  const endsAt = parseRequiredLocalDateTime(input.endsAt, 'Fine evento');
  const bookingOpensAt = parseRequiredLocalDateTime(
    input.bookingOpensAt,
    'Apertura prenotazioni',
  );
  const bookingClosesAt = parseRequiredLocalDateTime(
    input.bookingClosesAt,
    'Chiusura prenotazioni',
  );

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('La fine dell’evento deve essere successiva all’inizio.');
  }

  if (bookingOpensAt.getTime() >= bookingClosesAt.getTime()) {
    throw new Error(
      'L’apertura delle prenotazioni deve precedere la chiusura.',
    );
  }

  if (bookingClosesAt.getTime() > startsAt.getTime()) {
    throw new Error(
      'La chiusura delle prenotazioni non può essere successiva all’inizio dell’evento.',
    );
  }

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    bookingOpensAt: bookingOpensAt.toISOString(),
    bookingClosesAt: bookingClosesAt.toISOString(),
  };
}
