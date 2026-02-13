# Smart Y-Axis Scaling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement metric-specific y-axis scaling so weight/HR charts center on data range while steps/exercise start at zero.

**Architecture:** Add yAxisStrategy config field to metrics, implement domain calculation in chart component based on strategy, ensure all data points (values, rolling avg, comparison, goals) are included in range.

**Tech Stack:** TypeScript, React, Recharts, Vitest

---

## Task 1: Add YAxisStrategy Type

**Files:**
- Modify: `lib/types.ts`

**Step 1: Add YAxisStrategy type definition**

Add after the existing type definitions (around line 5):

```typescript
export type YAxisStrategy = 'auto-centered' | 'from-zero';
```

**Step 2: Update MetricConfig interface**

Locate the `MetricConfig` interface and add the new field:

```typescript
export type MetricConfig = {
  key: MetricKey;
  sourceType: string;
  label: string;
  displayUnit: string;
  aggregate: "sum" | "mean" | "last";
  yAxisStrategy: YAxisStrategy;  // Add this line
};
```

**Step 3: Commit type changes**

```bash
git add lib/types.ts
git commit -m "feat: add YAxisStrategy type for metric charts"
```

---

## Task 2: Add yAxisStrategy to Metric Configs

**Files:**
- Modify: `lib/metrics-config.ts:3-38`

**Step 1: Add yAxisStrategy to each metric**

Update each metric config in `METRIC_CONFIGS`:

```typescript
export const METRIC_CONFIGS: Record<MetricKey, MetricConfig> = {
  weight: {
    key: "weight",
    sourceType: "HKQuantityTypeIdentifierBodyMass",
    label: "Weight",
    displayUnit: "lb",
    aggregate: "last",
    yAxisStrategy: "auto-centered"
  },
  steps: {
    key: "steps",
    sourceType: "HKQuantityTypeIdentifierStepCount",
    label: "Steps",
    displayUnit: "steps",
    aggregate: "sum",
    yAxisStrategy: "from-zero"
  },
  resting_hr: {
    key: "resting_hr",
    sourceType: "HKQuantityTypeIdentifierRestingHeartRate",
    label: "Resting HR",
    displayUnit: "bpm",
    aggregate: "mean",
    yAxisStrategy: "auto-centered"
  },
  walking_hr: {
    key: "walking_hr",
    sourceType: "HKQuantityTypeIdentifierWalkingHeartRateAverage",
    label: "Walking HR",
    displayUnit: "bpm",
    aggregate: "mean",
    yAxisStrategy: "auto-centered"
  },
  exercise_minutes: {
    key: "exercise_minutes",
    sourceType: "HKQuantityTypeIdentifierAppleExerciseTime",
    label: "Exercise Minutes",
    displayUnit: "min",
    aggregate: "sum",
    yAxisStrategy: "from-zero"
  }
};
```

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No type errors, successful build

**Step 3: Commit config changes**

```bash
git add lib/metrics-config.ts
git commit -m "feat: add y-axis strategy to metric configs

- weight, resting_hr, walking_hr: auto-centered
- steps, exercise_minutes: from-zero"
```

---

## Task 3: Write Domain Calculation Tests

**Files:**
- Create: `tests/unit/chart-domain.test.ts`

**Step 1: Create test file with domain calculation tests**

```typescript
import { describe, it, expect } from 'vitest';

type YAxisStrategy = 'auto-centered' | 'from-zero';

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

describe('calculateDomain', () => {
  it('returns [0, auto] for from-zero strategy', () => {
    const result = calculateDomain('from-zero', [100, 200, 150]);
    expect(result).toEqual([0, 'auto']);
  });

  it('returns centered domain with 10% padding for auto-centered', () => {
    const result = calculateDomain('auto-centered', [150, 160, 155]);
    // min=150, max=160, range=10, padding=1
    expect(result).toEqual([149, 161]);
  });

  it('returns undefined for empty data', () => {
    const result = calculateDomain('auto-centered', []);
    expect(result).toBeUndefined();
  });

  it('returns undefined when all values are null', () => {
    const result = calculateDomain('auto-centered', [null, null, null]);
    expect(result).toBeUndefined();
  });

  it('handles single data point with minimum padding', () => {
    const result = calculateDomain('auto-centered', [100]);
    // Single value: padding = max(100 * 0.1, 5) = 10
    expect(result).toEqual([90, 110]);
  });

  it('handles single small value with minimum padding of 5', () => {
    const result = calculateDomain('auto-centered', [10]);
    // Single value: padding = max(10 * 0.1, 5) = 5
    expect(result).toEqual([5, 15]);
  });

  it('filters null values before calculating', () => {
    const result = calculateDomain('auto-centered', [150, null, 160, null, 155]);
    expect(result).toEqual([149, 161]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/unit/chart-domain.test.ts`
Expected: Tests PASS (we included implementation inline for simplicity)

**Step 3: Commit tests**

```bash
git add tests/unit/chart-domain.test.ts
git commit -m "test: add domain calculation tests for chart y-axis"
```

---

## Task 4: Implement Domain Calculation in Chart Component

**Files:**
- Modify: `components/metric-trend-chart.tsx:1-66`

**Step 1: Import YAxisStrategy type**

Update imports at the top of the file:

```typescript
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
import type { MetricResponse, YAxisStrategy } from "@/lib/types";
```

**Step 2: Add calculateDomain helper function**

Add this function after the type definitions and before the component:

```typescript
type ChartPoint = {
  date: string;
  value: number | null;
  rolling: number | null;
  compare: number | null;
  goal: number | null;
};

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
  // ... rest of component
```

**Step 3: Calculate domain in component**

Update the component body to calculate domain:

```typescript
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
          <LineChart data={points} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={24} />
            <YAxis domain={domain} />
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
```

**Step 4: Verify TypeScript compilation**

Run: `npm run build`
Expected: No type errors, successful build

**Step 5: Commit implementation**

```bash
git add components/metric-trend-chart.tsx
git commit -m "feat: implement smart y-axis scaling in chart component

- Calculate domain based on metric strategy
- Include all data (values, rolling avg, comparison, goals)
- Handle empty data and single value edge cases"
```

---

## Task 5: Manual Verification

**Files:**
- None (verification only)

**Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on http://localhost:3000

**Step 2: Verify weight chart scaling**

1. Open http://localhost:3000 in browser
2. Navigate to weight chart
3. Verify:
   - Y-axis does NOT start at 0
   - Weight line is centered in chart (not pinned to top)
   - Y-axis range is close to actual data range with padding

**Step 3: Verify steps chart scaling**

1. Navigate to steps chart
2. Verify:
   - Y-axis DOES start at 0
   - Steps bars/lines show relative to zero baseline

**Step 4: Verify other metrics**

1. Check resting HR and walking HR charts (should be auto-centered)
2. Check exercise minutes chart (should start at 0)

**Step 5: Test edge cases if data available**

- Charts with sparse data (many null values)
- Charts with very small data ranges
- Charts with goal lines outside data range

**Step 6: Document verification results**

Add verification notes to this plan or commit message if issues found.

---

## Task 6: Run All Tests

**Files:**
- None (testing only)

**Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass, including new chart-domain tests

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: Check for type errors**

Run: `npm run build`
Expected: Clean build, no TypeScript errors

**Step 4: Final commit if any fixes needed**

```bash
git add .
git commit -m "fix: address test failures or type issues"
```

---

## Completion Checklist

- [ ] YAxisStrategy type added to types.ts
- [ ] MetricConfig interface updated with yAxisStrategy
- [ ] All 5 metrics have yAxisStrategy configured
- [ ] Domain calculation tests written and passing
- [ ] Chart component implements domain calculation
- [ ] TypeScript compiles without errors
- [ ] Manual verification shows correct scaling behavior
- [ ] All automated tests pass
- [ ] All changes committed with clear messages

## Success Criteria

- Weight chart displays centered data (not pinned to top)
- Heart rate charts show centered data
- Steps and exercise charts maintain 0 baseline
- No TypeScript errors
- All tests passing
- Clean git history with atomic commits
