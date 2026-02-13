import { APP_CONFIG } from "@/lib/config";
import { eachDate, previousRange } from "@/lib/date";
import { getDb } from "@/lib/db";
import { METRIC_CONFIGS, METRIC_KEYS } from "@/lib/metrics-config";
import { delta, rollingAverage } from "@/lib/math";
import type { DailyPoint, MetricKey, MetricResponse, OverviewMetric, OverviewResponse } from "@/lib/types";

export async function getOverview(from: string, to: string, compare: boolean): Promise<OverviewResponse> {
  const metrics: OverviewMetric[] = [];

  for (const metric of METRIC_KEYS) {
    const currentValue = await periodValue(metric, from, to);
    let compareValue: number | null = null;

    if (compare) {
      const previous = previousRange(from, to);
      compareValue = await periodValue(metric, previous.from, previous.to);
    }

    metrics.push({
      metric,
      label: METRIC_CONFIGS[metric].label,
      unit: METRIC_CONFIGS[metric].displayUnit,
      currentValue,
      compareValue,
      delta: delta(currentValue, compareValue)
    });
  }

  return {
    from,
    to,
    compare,
    metrics
  };
}

export async function getMetricSeries(
  metric: MetricKey,
  from: string,
  to: string,
  compare: boolean,
  windowSize = APP_CONFIG.rollingWindowDays
): Promise<MetricResponse> {
  const currentSeries = await fetchDailySeries(metric, from, to, windowSize);

  let compareSeries: DailyPoint[] | undefined;
  let compareValue: number | null = null;

  if (compare) {
    const previous = previousRange(from, to);
    compareSeries = await fetchDailySeries(metric, previous.from, previous.to, windowSize);
    compareValue = await periodValue(metric, previous.from, previous.to);
  }

  const currentValue = await periodValue(metric, from, to);

  return {
    metric,
    unit: METRIC_CONFIGS[metric].displayUnit,
    series: currentSeries,
    compareSeries,
    delta: delta(currentValue, compareValue)
  };
}

async function fetchDailySeries(metric: MetricKey, from: string, to: string, windowSize: number): Promise<DailyPoint[]> {
  const db = await getDb();

  const rows = await db.all<{ date_local: string; agg_value: number }>(
    `
      SELECT CAST(date_local AS TEXT) AS date_local, agg_value
      FROM daily_metrics
      WHERE metric_key = ? AND date_local BETWEEN ? AND ?
      ORDER BY date_local ASC
    `,
    [metric, from, to]
  );

  const byDate = new Map(rows.map((row) => [row.date_local, row.agg_value]));
  const dates = eachDate(from, to);

  const values = dates.map((date) => {
    const value = byDate.get(date);
    return value === undefined ? null : Number(value);
  });

  const rolling = rollingAverage(values, windowSize);

  return dates.map((date, index) => ({
    date,
    value: values[index],
    rollingAvg: rolling[index]
  }));
}

async function periodValue(metric: MetricKey, from: string, to: string): Promise<number | null> {
  const db = await getDb();
  const aggregate = METRIC_CONFIGS[metric].aggregate;

  if (aggregate === "sum") {
    const row = await db.get<{ value: number | null }>(
      `
        SELECT SUM(agg_value) AS value
        FROM daily_metrics
        WHERE metric_key = ? AND date_local BETWEEN ? AND ?
      `,
      [metric, from, to]
    );
    return row?.value ?? null;
  }

  if (aggregate === "mean") {
    const row = await db.get<{ value: number | null }>(
      `
        SELECT AVG(agg_value) AS value
        FROM daily_metrics
        WHERE metric_key = ? AND date_local BETWEEN ? AND ?
      `,
      [metric, from, to]
    );
    return row?.value ?? null;
  }

  const row = await db.get<{ value: number | null }>(
    `
      SELECT agg_value AS value
      FROM daily_metrics
      WHERE metric_key = ? AND date_local BETWEEN ? AND ?
      ORDER BY date_local DESC
      LIMIT 1
    `,
    [metric, from, to]
  );

  return row?.value ?? null;
}
