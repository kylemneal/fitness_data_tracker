import type { MetricConfig, MetricKey } from "@/lib/types";

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

const SOURCE_TO_METRIC = Object.values(METRIC_CONFIGS).reduce<Record<string, MetricKey>>((acc, config) => {
  acc[config.sourceType] = config.key;
  return acc;
}, {});

export const METRIC_KEYS = Object.keys(METRIC_CONFIGS) as MetricKey[];

export function metricKeyFromSourceType(sourceType: string): MetricKey | null {
  return SOURCE_TO_METRIC[sourceType] ?? null;
}
