"use client";

import { useEffect, useMemo, useState } from "react";
import { METRIC_CONFIGS, METRIC_KEYS } from "@/lib/metrics-config";
import type { MetricGoal, MetricKey } from "@/lib/types";

type GoalDrafts = Record<MetricKey, string>;

export function GoalEditor({
  goals,
  savingMetric,
  onSave
}: {
  goals: MetricGoal[];
  savingMetric: MetricKey | null;
  onSave: (metric: MetricKey, targetValue: number) => void;
}) {
  const initialDrafts = useMemo<GoalDrafts>(() => {
    const map = {} as GoalDrafts;
    for (const metric of METRIC_KEYS) {
      const value = goals.find((goal) => goal.metric === metric)?.targetValue;
      map[metric] = value === null || value === undefined ? "" : String(value);
    }
    return map;
  }, [goals]);

  const [drafts, setDrafts] = useState<GoalDrafts>(initialDrafts);

  useEffect(() => {
    setDrafts(initialDrafts);
  }, [initialDrafts]);

  return (
    <section className="panel">
      <h2>Goals</h2>
      <div className="goals-grid">
        {METRIC_KEYS.map((metric) => (
          <div key={metric} className="goal-item">
            <label htmlFor={`goal-${metric}`}>{METRIC_CONFIGS[metric].label}</label>
            <div className="goal-row">
              <input
                id={`goal-${metric}`}
                type="number"
                value={drafts[metric]}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [metric]: event.target.value
                  }))
                }
                placeholder="Set target"
              />
              <button
                className="button button-small"
                disabled={savingMetric === metric || drafts[metric].trim() === ""}
                onClick={() => {
                  const parsed = Number.parseFloat(drafts[metric]);
                  if (Number.isNaN(parsed)) {
                    return;
                  }
                  onSave(metric, parsed);
                }}
              >
                {savingMetric === metric ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
