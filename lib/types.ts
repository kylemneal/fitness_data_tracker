export type MetricKey =
  | "weight"
  | "steps"
  | "resting_hr"
  | "walking_hr"
  | "exercise_minutes";

export type PeriodPreset = "7d" | "30d" | "90d" | "1y" | "all";

export type DailyPoint = {
  date: string;
  value: number | null;
  rollingAvg: number | null;
};

export type MetricDelta = {
  abs: number | null;
  pct: number | null;
};

export type MetricResponse = {
  metric: MetricKey;
  unit: string;
  series: DailyPoint[];
  compareSeries?: DailyPoint[];
  delta?: MetricDelta;
};

export type OverviewMetric = {
  metric: MetricKey;
  label: string;
  unit: string;
  currentValue: number | null;
  compareValue: number | null;
  delta: MetricDelta;
};

export type OverviewResponse = {
  from: string;
  to: string;
  compare: boolean;
  metrics: OverviewMetric[];
};

export type ImportWarning = {
  type: string;
  message: string;
  metricType?: string;
  startDate?: string;
  value?: string;
  sample: string;
};

export type ImportStatus = {
  runId: string | null;
  status: "idle" | "running" | "completed" | "completed_with_warnings" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  scannedFiles: number;
  recordsSeen: number;
  bytesRead: number;
  parsed: number;
  inserted: number;
  duplicates: number;
  warnings: number;
  errors: string | null;
};

export type IngestRecord = {
  fingerprint: string;
  metricKey: MetricKey;
  sourceType: string;
  value: number;
  unit: string;
  startTs: string;
  endTs: string;
  creationTs: string;
  sourceName: string;
  sourceVersion: string;
  device: string;
  dateLocal: string;
};

export type IngestCounters = {
  scannedFiles: number;
  recordsSeen: number;
  bytesRead: number;
  parsedRecords: number;
  insertedRecords: number;
  duplicateRecords: number;
  warningCount: number;
};

export type MetricGoal = {
  metric: MetricKey;
  targetValue: number | null;
  unit: string;
  updatedAt: string | null;
};

export type DataQualitySummaryItem = {
  warningType: string;
  count: number;
};

export type DataQualitySample = {
  warningType: string;
  message: string;
  metricType: string | null;
  startTs: string | null;
  rawValue: string | null;
  sampleJson: string;
};

export type DataQualityResponse = {
  runId: string | null;
  summary: DataQualitySummaryItem[];
  samples: DataQualitySample[];
};

export type MetricConfig = {
  key: MetricKey;
  sourceType: string;
  label: string;
  displayUnit: string;
  aggregate: "sum" | "mean" | "last";
};
