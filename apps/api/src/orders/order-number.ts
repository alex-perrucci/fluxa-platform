export function businessDateForTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');

  if (!year || !month || !day) {
    throw new RangeError('Unable to calculate the location business date.');
  }

  return `${year}-${month}-${day}`;
}

export function formatOrderNumber(
  businessDate: string,
  sequence: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new RangeError('Invalid business date.');
  }

  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new RangeError('Order sequence must be a positive integer.');
  }

  return `ORD-${businessDate.replaceAll('-', '')}-${sequence
    .toString()
    .padStart(6, '0')}`;
}
