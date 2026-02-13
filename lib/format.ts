import type { MetricKey } from "@/lib/types";

export function formatMetricValue(metric: MetricKey, value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  if (metric === "steps" || metric === "exercise_minutes") {
    return Math.round(value).toLocaleString();
  }

  return value.toFixed(1);
}

export function formatDelta(value: number | null, suffix = ""): string {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}
