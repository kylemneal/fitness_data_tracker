import { describe, expect, it } from "vitest";
import { fingerprintForRecord } from "../../lib/importer/fingerprint";

describe("fingerprintForRecord", () => {
  it("is deterministic for identical values", () => {
    const base = {
      sourceType: "HKQuantityTypeIdentifierStepCount",
      startTs: "2024-01-01T08:00:00-08:00",
      endTs: "2024-01-01T09:00:00-08:00",
      value: 4000,
      unit: "count",
      sourceName: "Watch",
      sourceVersion: "1"
    };

    const a = fingerprintForRecord(base);
    const b = fingerprintForRecord(base);

    expect(a).toBe(b);
  });

  it("changes when value changes", () => {
    const a = fingerprintForRecord({
      sourceType: "HKQuantityTypeIdentifierStepCount",
      startTs: "2024-01-01T08:00:00-08:00",
      endTs: "2024-01-01T09:00:00-08:00",
      value: 4000,
      unit: "count",
      sourceName: "Watch",
      sourceVersion: "1"
    });

    const b = fingerprintForRecord({
      sourceType: "HKQuantityTypeIdentifierStepCount",
      startTs: "2024-01-01T08:00:00-08:00",
      endTs: "2024-01-01T09:00:00-08:00",
      value: 4500,
      unit: "count",
      sourceName: "Watch",
      sourceVersion: "1"
    });

    expect(a).not.toBe(b);
  });
});
