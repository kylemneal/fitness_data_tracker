"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toDateString } from "@/lib/date";
import { METRIC_KEYS } from "@/lib/metrics-config";
import type {
  DataQualityResponse,
  ImportStatus,
  MetricGoal,
  MetricKey,
  MetricResponse,
  OverviewResponse
} from "@/lib/types";
import { DateRangeControls } from "@/components/date-range-controls";
import { ImportStatusBadge } from "@/components/import-status-badge";
import { RescanButton } from "@/components/rescan-button";
import { MetricKpiCard } from "@/components/metric-kpi-card";
import { MetricTrendChart } from "@/components/metric-trend-chart";
import { GoalEditor } from "@/components/goal-editor";
import { DataQualitySummary } from "@/components/data-quality-summary";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    from: toDateString(start),
    to: toDateString(end)
  };
}

function activePreset(from: string, to: string): "7d" | "30d" | "90d" | "1y" | null {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

  if (days === 7) return "7d";
  if (days === 30) return "30d";
  if (days === 90) return "90d";
  if (days === 365) return "1y";

  return null;
}

function rangeFromPreset(preset: "7d" | "30d" | "90d" | "1y" | "all"): { from: string; to: string } {
  if (preset === "all") {
    return { from: "2022-01-01", to: toDateString(new Date()) };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: toDateString(from),
    to: toDateString(to)
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return response.json();
}

export function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const defaults = useMemo(() => defaultRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const compare = searchParams.get("compare") !== "false";

  const [savingMetric, setSavingMetric] = useState<MetricKey | null>(null);

  const statusQuery = useQuery<ImportStatus>({
    queryKey: ["import-status"],
    queryFn: () => fetchJson("/api/import/status"),
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5000 : 20000)
  });

  const isImportRunning = statusQuery.data?.status === "running";

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ["overview", from, to, compare],
    queryFn: () => fetchJson(`/api/dashboard/overview?from=${from}&to=${to}&compare=${compare}`),
    enabled: statusQuery.isSuccess && !isImportRunning
  });

  const metricQueries = useQueries({
    queries: METRIC_KEYS.map((metric) => ({
      queryKey: ["metric", metric, from, to, compare, 7],
      queryFn: () =>
        fetchJson<MetricResponse>(`/api/metrics/${metric}?from=${from}&to=${to}&compare=${compare}&window=7`),
      enabled: statusQuery.isSuccess && !isImportRunning
    }))
  });

  const goalsQuery = useQuery<{ goals: MetricGoal[] }>({
    queryKey: ["goals"],
    queryFn: () => fetchJson("/api/goals"),
    enabled: statusQuery.isSuccess && !isImportRunning
  });

  const qualityQuery = useQuery<DataQualityResponse>({
    queryKey: ["data-quality", statusQuery.data?.runId],
    queryFn: () => fetchJson(`/api/data-quality?limit=120`),
    enabled: statusQuery.isSuccess && !isImportRunning
  });

  const rescanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/import/rescan", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to trigger rescan");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["import-status"] });
    }
  });

  const goalMutation = useMutation({
    mutationFn: async ({ metric, targetValue }: { metric: MetricKey; targetValue: number }) => {
      const response = await fetch(`/api/goals/${metric}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetValue })
      });
      if (!response.ok) {
        throw new Error(`Failed to update ${metric} goal`);
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
    onSettled: () => {
      setSavingMetric(null);
    }
  });

  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    router.replace(`${pathname}?${params.toString()}`);
  }

  const metricGoals = new Map((goalsQuery.data?.goals ?? []).map((goal) => [goal.metric, goal.targetValue]));

  useEffect(() => {
    if (statusQuery.data?.status === "completed" || statusQuery.data?.status === "completed_with_warnings") {
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["metric"] });
      void queryClient.invalidateQueries({ queryKey: ["data-quality"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    }
  }, [queryClient, statusQuery.data?.status]);

  return (
    <main className="page">
      <header className="top-bar panel">
        <div>
          <h1>Apple Watch Trends Dashboard</h1>
          <p className="subtle">Local-only processing from raw_exports/</p>
        </div>
        <div className="top-bar-actions">
          <ImportStatusBadge status={statusQuery.data} />
          <RescanButton isPending={rescanMutation.isPending} onClick={() => rescanMutation.mutate()} />
        </div>
      </header>

      <DateRangeControls
        from={from}
        to={to}
        compare={compare}
        activePreset={activePreset(from, to)}
        onSetRange={(nextFrom, nextTo) => setParams({ from: nextFrom, to: nextTo })}
        onSetPreset={(preset) => {
          const range = rangeFromPreset(preset);
          setParams({ from: range.from, to: range.to });
        }}
        onSetCompare={(enabled) => setParams({ compare: enabled ? "true" : "false" })}
      />

      {overviewQuery.isLoading ? <section className="panel">Loading overview...</section> : null}
      {overviewQuery.isError ? <section className="panel error">Failed to load overview.</section> : null}

      {overviewQuery.data ? (
        <section className="kpi-grid">
          {overviewQuery.data.metrics.map((metric) => (
            <MetricKpiCard key={metric.metric} metric={metric} />
          ))}
        </section>
      ) : null}

      <section className="metric-grid">
        {metricQueries.map((query, index) => {
          if (query.isLoading) {
            return (
              <article key={METRIC_KEYS[index]} className="panel metric-panel">
                Loading {METRIC_KEYS[index]}...
              </article>
            );
          }

          if (query.isError || !query.data) {
            return (
              <article key={METRIC_KEYS[index]} className="panel error metric-panel">
                Failed to load {METRIC_KEYS[index]}.
              </article>
            );
          }

          return <MetricTrendChart key={query.data.metric} metric={query.data} goal={metricGoals.get(query.data.metric) ?? null} />;
        })}
      </section>

      <GoalEditor
        goals={goalsQuery.data?.goals ?? []}
        savingMetric={savingMetric}
        onSave={(metric, targetValue) => {
          setSavingMetric(metric);
          goalMutation.mutate({ metric, targetValue });
        }}
      />

      <DataQualitySummary data={qualityQuery.data} />

      {statusQuery.data?.status === "running" ? (
        <section className="panel warning">Import is running in the background. Charts update after completion.</section>
      ) : null}

      {!overviewQuery.data && statusQuery.data?.status !== "running" ? (
        <section className="panel empty-state">
          <h2>No data available yet</h2>
          <p>
            Confirm `raw_exports/` contains Apple Health export folders with `export.xml`, then click <strong>Rescan</strong>.
          </p>
        </section>
      ) : null}
    </main>
  );
}
