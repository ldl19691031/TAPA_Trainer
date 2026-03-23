import { describe, expect, it } from 'vitest';
import { getDefaultFaceSelection, normalizeFaceBox } from '../lib/face-utils';

describe('normalizeFaceBox', () => {
  it('normalizes face coordinates into 0..1 range', () => {
    const face = normalizeFaceBox([64, 36], [320, 180], 640, 360, 0.93);
    expect(face).toEqual({
      left: 0.1,
      top: 0.1,
      width: 0.4,
      height: 0.4,
      score: 0.93,
    });
  });

  it('clamps out-of-bounds coordinates', () => {
    const face = normalizeFaceBox([-20, 50], [700, 500], 640, 360, 1.2);
    expect(face).toEqual({
      left: 0,
      top: 0.1388888888888889,
      width: 1,
      height: 0.8611111111111112,
      score: 1,
    });
  });

  it('returns null when frame size is invalid or box is too small', () => {
    expect(normalizeFaceBox([0, 0], [10, 10], 0, 100, 0.5)).toBeNull();
    expect(normalizeFaceBox([10, 10], [11, 11], 1000, 1000, 0.5)).toBeNull();
  });
});

describe('getDefaultFaceSelection', () => {
  it('auto-selects only when exactly one face exists', () => {
    expect(getDefaultFaceSelection(0)).toBeNull();
    expect(getDefaultFaceSelection(1)).toBe(0);
    expect(getDefaultFaceSelection(2)).toBeNull();
  });
});
