"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { METRIC_CONFIGS } from "@/lib/metrics-config";
import type { MetricResponse } from "@/lib/types";

type ChartPoint = {
  date: string;
  value: number | null;
  rolling: number | null;
  compare: number | null;
  goal: number | null;
};

export function MetricTrendChart({
  metric,
  goal
}: {
  metric: MetricResponse;
  goal: number | null;
}) {
  const points: ChartPoint[] = metric.series.map((point, index) => ({
    date: point.date,
    value: point.value,
    rolling: point.rollingAvg,
    compare: metric.compareSeries?.[index]?.value ?? null,
    goal
  }));

  return (
    <article className="panel metric-panel">
      <header className="metric-panel-header">
        <h3>{METRIC_CONFIGS[metric.metric].label}</h3>
        <p>{METRIC_CONFIGS[metric.metric].displayUnit}</p>
      </header>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={24} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" name="Daily" stroke="#006d77" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="rolling" name="7d Avg" stroke="#e29578" dot={false} strokeWidth={2} />
            {metric.compareSeries ? (
              <Line type="monotone" dataKey="compare" name="Prev period" stroke="#7a6c5d" dot={false} strokeDasharray="5 4" />
            ) : null}
            {goal !== null ? <ReferenceLine y={goal} stroke="#d7263d" strokeDasharray="4 4" label="Goal" /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
