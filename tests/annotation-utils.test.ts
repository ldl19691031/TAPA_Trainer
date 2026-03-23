import { describe, expect, it } from 'vitest';
import {
  buildMergeClusters,
  formatSeconds,
  normalizeSegment,
  overlapRatio,
  snapToStep,
} from '../lib/annotation-utils';

describe('annotation utils', () => {
  it('snapToStep rounds to nearest step', () => {
    expect(snapToStep(1.24, 0.5)).toBe(1);
    expect(snapToStep(1.26, 0.5)).toBe(1.5);
  });

  it('normalizeSegment enforces minimum duration and non-negative start', () => {
    expect(normalizeSegment(-1, 0.1, 0.5, 2)).toEqual({ start: 0, end: 2 });
    expect(normalizeSegment(10.1, 12.1, 0.5, 2)).toEqual({ start: 10, end: 12 });
  });

  it('overlapRatio works', () => {
    expect(overlapRatio(0, 4, 1, 3)).toBeCloseTo(1, 5);
    expect(overlapRatio(0, 2, 3, 5)).toBe(0);
  });

  it('buildMergeClusters merges by threshold and counts drivers', () => {
    const rows = [
      { start_sec: 0, end_sec: 4, drivers: ['be_perfect'] },
      { start_sec: 1, end_sec: 3, drivers: ['be_strong'] },
      { start_sec: 10, end_sec: 12, drivers: ['be_perfect'] },
    ];
    const clusters = buildMergeClusters(rows, 0.5);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].start_sec).toBe(0);
    expect(clusters[0].end_sec).toBe(4);
    expect(clusters[0].driverCount.be_perfect).toBe(1);
    expect(clusters[0].driverCount.be_strong).toBe(1);
  });

  it('formatSeconds prints mm:ss.t', () => {
    expect(formatSeconds(127.3)).toBe('02:07.3');
  });
});

