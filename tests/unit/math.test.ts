import { describe, expect, it } from "vitest";
import { delta, rollingAverage } from "../../lib/math";

describe("rollingAverage", () => {
  it("computes rolling averages while skipping null values", () => {
    const out = rollingAverage([10, null, 20, 30, null], 3);
    expect(out).toEqual([10, 10, 15, 25, 25]);
  });
});

describe("delta", () => {
  it("returns absolute and percent deltas", () => {
    expect(delta(120, 100)).toEqual({ abs: 20, pct: 20 });
  });

  it("handles nulls", () => {
    expect(delta(null, 100)).toEqual({ abs: null, pct: null });
  });
});
