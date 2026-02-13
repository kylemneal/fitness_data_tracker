import { describe, it, expect } from 'vitest';
import { formatMetricValue } from '@/lib/metric-formatting';

describe('formatMetricValue', () => {
  it('formats weight to 1 decimal place', () => {
    const result = formatMetricValue(179.851234, 'weight');
    expect(result).toBe('179.9');
  });

  it('formats weight with rounding', () => {
    const result = formatMetricValue(179.84, 'weight');
    expect(result).toBe('179.8');
  });

  it('formats steps as whole number', () => {
    const result = formatMetricValue(12345.678, 'steps');
    expect(result).toBe('12346');
  });

  it('formats heart rate to 1 decimal place', () => {
    const result = formatMetricValue(68.456, 'resting_hr');
    expect(result).toBe('68.5');
  });

  it('formats exercise minutes as whole number', () => {
    const result = formatMetricValue(45.7, 'exercise_minutes');
    expect(result).toBe('46');
  });

  it('returns empty string for null values', () => {
    const result = formatMetricValue(null, 'weight');
    expect(result).toBe('');
  });
});
