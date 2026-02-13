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
