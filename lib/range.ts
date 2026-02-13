import { toDateString } from "@/lib/date";

export function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: toDateString(from),
    to: toDateString(to)
  };
}

export function parseRangeParams(fromRaw: string | null, toRaw: string | null): { from: string; to: string } {
  const fallback = defaultRange();
  if (!fromRaw || !toRaw) {
    return fallback;
  }

  if (!isDateString(fromRaw) || !isDateString(toRaw) || fromRaw > toRaw) {
    return fallback;
  }

  return {
    from: fromRaw,
    to: toRaw
  };
}

export function parseBooleanParam(value: string | null, fallback = false): boolean {
  if (value === null) {
    return fallback;
  }

  return value === "true";
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
