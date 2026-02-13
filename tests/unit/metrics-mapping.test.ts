import { describe, expect, it } from "vitest";
import { metricKeyFromSourceType } from "../../lib/metrics-config";

describe("metric mapping", () => {
  it("maps source identifiers to selected metrics", () => {
    expect(metricKeyFromSourceType("HKQuantityTypeIdentifierBodyMass")).toBe("weight");
    expect(metricKeyFromSourceType("HKQuantityTypeIdentifierStepCount")).toBe("steps");
    expect(metricKeyFromSourceType("HKQuantityTypeIdentifierRestingHeartRate")).toBe("resting_hr");
    expect(metricKeyFromSourceType("HKQuantityTypeIdentifierWalkingHeartRateAverage")).toBe("walking_hr");
    expect(metricKeyFromSourceType("HKQuantityTypeIdentifierAppleExerciseTime")).toBe("exercise_minutes");
  });
});
