import type { OverviewMetric } from "@/lib/types";
import { formatDelta, formatMetricValue } from "@/lib/format";

export function MetricKpiCard({ metric }: { metric: OverviewMetric }) {
  const deltaClass = metric.delta.abs === null ? "kpi-delta-neutral" : metric.delta.abs >= 0 ? "kpi-delta-up" : "kpi-delta-down";

  return (
    <article className="kpi-card">
      <h3>{metric.label}</h3>
      <p className="kpi-value">
        {formatMetricValue(metric.metric, metric.currentValue)} <span>{metric.unit}</span>
      </p>
      <p className={`kpi-delta ${deltaClass}`}>
        Delta: {formatDelta(metric.delta.abs)} {metric.unit}
        {" · "}
        {formatDelta(metric.delta.pct, "%")}
      </p>
    </article>
  );
}
