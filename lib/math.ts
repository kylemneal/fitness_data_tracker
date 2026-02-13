import type { MetricDelta } from "@/lib/types";

export function rollingAverage(values: Array<number | null>, windowSize: number): Array<number | null> {
  if (windowSize <= 0) {
    return values.map(() => null);
  }

  const out: Array<number | null> = [];

  for (let i = 0; i < values.length; i += 1) {
    const window = values.slice(Math.max(0, i - windowSize + 1), i + 1).filter((value): value is number => value !== null);
    if (window.length === 0) {
      out.push(null);
      continue;
    }

    const sum = window.reduce((acc, value) => acc + value, 0);
    out.push(sum / window.length);
  }

  return out;
}

export function delta(current: number | null, previous: number | null): MetricDelta {
  if (current === null || previous === null) {
    return { abs: null, pct: null };
  }

  const abs = current - previous;
  const pct = previous === 0 ? null : (abs / previous) * 100;

  return { abs, pct };
}
