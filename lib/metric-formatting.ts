import type { MetricKey } from "@/lib/types";

/**
 * Get decimal precision for a metric
 */
function getDecimalPrecision(metric: MetricKey): number {
  // Steps and exercise minutes are whole numbers
  if (metric === 'steps' || metric === 'exercise_minutes') {
    return 0;
  }

  // Weight and heart rates show 1 decimal place
  return 1;
}

/**
 * Format metric value for display with appropriate decimal precision
 */
export function formatMetricValue(value: number | null, metric: MetricKey): string {
  if (value === null) {
    return '';
  }

  const precision = getDecimalPrecision(metric);
  return value.toFixed(precision);
}
