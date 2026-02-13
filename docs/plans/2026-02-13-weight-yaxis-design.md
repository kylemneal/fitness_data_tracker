# Smart Y-Axis Scaling for Metrics Charts

**Date:** 2026-02-13
**Status:** Approved
**Branch:** weight_ui_bug

## Problem Statement

The weight tracking chart displays a progress line pinned to the top of the y-axis because Recharts defaults to a 0-max domain. For weight values like 150-160 lbs, this creates a chart spanning 0-160, making the actual data compressed and hard to read.

## Solution Overview

Implement smart y-axis scaling that adapts to metric type:
- **Auto-centered metrics** (weight, heart rate): Scale y-axis to data range with padding, no forced zero
- **From-zero metrics** (steps, exercise): Keep traditional 0-based scaling where zero is meaningful

## Design

### 1. Configuration Schema

Add `yAxisStrategy` field to `MetricConfig` type:

```typescript
type YAxisStrategy = 'auto-centered' | 'from-zero';

interface MetricConfig {
  // ...existing fields
  yAxisStrategy: YAxisStrategy;
}
```

**Strategy Assignments:**
- `weight`: `'auto-centered'` - Body mass should center on actual range
- `resting_hr`: `'auto-centered'` - Heart rate variability more visible
- `walking_hr`: `'auto-centered'` - Same as resting HR
- `steps`: `'from-zero'` - Zero steps is meaningful baseline
- `exercise_minutes`: `'from-zero'` - Zero exercise is meaningful baseline

### 2. Chart Component Implementation

Update `MetricTrendChart` to calculate domain based on strategy:

**For `'auto-centered'`:**
```typescript
const allValues = points
  .flatMap(p => [p.value, p.rolling, p.compare, p.goal])
  .filter(v => v !== null);

const dataMin = Math.min(...allValues);
const dataMax = Math.max(...allValues);
const padding = (dataMax - dataMin) * 0.1;  // 10% padding

domain = [dataMin - padding, dataMax + padding];
```

**For `'from-zero'`:**
```typescript
domain = [0, 'auto'];  // Recharts auto-scales max
```

**Implementation steps:**
1. Read strategy from `METRIC_CONFIGS[metric.metric].yAxisStrategy`
2. Calculate domain including all data: daily values, rolling average, comparison period, goal line
3. Pass computed domain to `<YAxis domain={domain} />`

### 3. Edge Cases

**Empty data:**
- Fallback to `domain={undefined}` (Recharts default)
- Prevents NaN/Infinity errors

**Single data point:**
- For auto-centered: use fixed padding (±10% of value or minimum ±5 units)
- Prevents flat line when dataMin === dataMax

**Negative values:**
- Should not occur for health metrics
- Auto-centered handles correctly if encountered
- From-zero maintains 0 minimum

**Goal line outside range:**
- Goals included in domain calculation (in flatMap)
- Ensures reference lines always visible

**Type safety:**
- `yAxisStrategy` is required field on MetricConfig
- Forces explicit decision for new metrics

### 4. Testing Strategy

**Unit tests:**
- Auto-centered with typical ranges (weight 150-160)
- From-zero returns `[0, 'auto']`
- Empty data fallback
- Single data point padding
- Goal line inclusion in domain

**Integration tests (optional):**
- Render weight chart, verify y-axis doesn't start at 0
- Render steps chart, verify y-axis starts at 0

**Manual verification:**
- Load dashboard with real data
- Confirm weight chart shows centered line
- Confirm steps/exercise charts start at 0

## Implementation Impact

**Files modified:**
- `lib/types.ts` - Add YAxisStrategy type
- `lib/metrics-config.ts` - Add yAxisStrategy to each metric
- `components/metric-trend-chart.tsx` - Domain calculation logic

**No breaking changes:**
- Pure UI enhancement
- No API changes
- No schema changes
- Existing charts scale better automatically

## Success Criteria

- Weight chart displays data centered in visible range (not pinned to top)
- Heart rate charts show variability clearly
- Steps and exercise charts maintain 0 baseline
- All data points, rolling averages, comparison periods, and goals visible
- No errors with empty/sparse data
