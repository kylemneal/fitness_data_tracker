export function normalizeAppleDate(rawDate: string | undefined): string | null {
  if (!rawDate) {
    return null;
  }

  const match = rawDate.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, date, time, tzHour, tzMinute] = match;
  return `${date}T${time}${tzHour}:${tzMinute}`;
}

export function datePartFromAppleDate(rawDate: string | undefined): string | null {
  if (!rawDate || rawDate.length < 10) {
    return null;
  }

  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date;
}

export function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function daysBetweenInclusive(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = daysBetweenInclusive(from, to);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const prevTo = addDays(fromDate, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  return {
    from: toDateString(prevFrom),
    to: toDateString(prevTo)
  };
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  for (let current = start; current <= end; current = addDays(current, 1)) {
    dates.push(toDateString(current));
  }

  return dates;
}
