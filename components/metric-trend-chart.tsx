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
import type { TooltipProps } from 'recharts';
import { METRIC_CONFIGS } from "@/lib/metrics-config";
import { formatMetricValue } from "@/lib/metric-formatting";
import type { MetricResponse, YAxisStrategy, MetricKey } from "@/lib/types";

type ChartPoint = {
  date: string;
  value: number | null;
  rolling: number | null;
  compare: number | null;
  goal: number | null;
};

/**
 * Custom tooltip that formats values with appropriate decimal precision
 */
function CustomTooltip({ active, payload, metric }: TooltipProps<number, string> & { metric: MetricKey }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '8px 12px',
      border: '1px solid #ccc',
      borderRadius: '4px'
    }}>
      <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>{payload[0].payload.date}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ margin: '2px 0', fontSize: '13px', color: entry.color }}>
          {entry.name}: {formatMetricValue(entry.value as number, metric)}
        </p>
      ))}
    </div>
  );
}

/**
 * Calculate y-axis domain based on strategy and data points
 */
function calculateDomain(
  strategy: YAxisStrategy,
  dataPoints: (number | null)[]
): [number, number | 'auto'] | undefined {
  const values = dataPoints.filter((v): v is number => v !== null);

  if (values.length === 0) {
    return undefined;
  }

  if (strategy === 'from-zero') {
    return [0, 'auto'];
  }

  // auto-centered strategy
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  // Handle single value case
  if (dataMin === dataMax) {
    const padding = Math.max(dataMin * 0.1, 5);
    return [dataMin - padding, dataMax + padding];
  }

  const padding = (dataMax - dataMin) * 0.1;
  return [dataMin - padding, dataMax + padding];
}

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

  // Calculate domain based on metric's y-axis strategy
  const strategy = METRIC_CONFIGS[metric.metric].yAxisStrategy;
  const allValues = points.flatMap(p => [p.value, p.rolling, p.compare, p.goal]);
  const domain = calculateDomain(strategy, allValues);

  return (
    <article className="panel metric-panel">
      <header className="metric-panel-header">
        <h3>{METRIC_CONFIGS[metric.metric].label}</h3>
        <p>{METRIC_CONFIGS[metric.metric].displayUnit}</p>
      </header>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={24} />
            <YAxis
              domain={domain}
              tickFormatter={(value) => formatMetricValue(value, metric.metric)}
            />
            <Tooltip content={<CustomTooltip metric={metric.metric} />} />
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
