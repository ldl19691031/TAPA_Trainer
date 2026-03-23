import { describe, expect, it } from 'vitest';
import { pickNearestPersonFrameCandidates, type PersonFrameRow } from '../lib/person-utils';

describe('pickNearestPersonFrameCandidates', () => {
  it('returns candidates from the nearest timestamp only', () => {
    const rows: PersonFrameRow[] = [
      {
        ts_sec: 10.0,
        track_id: 2,
        left_ratio: 0.1,
        top_ratio: 0.1,
        width_ratio: 0.2,
        height_ratio: 0.3,
        score: 0.8,
      },
      {
        ts_sec: 10.0,
        track_id: 1,
        left_ratio: 0.3,
        top_ratio: 0.2,
        width_ratio: 0.2,
        height_ratio: 0.3,
        score: 0.9,
      },
      {
        ts_sec: 10.5,
        track_id: 3,
        left_ratio: 0.5,
        top_ratio: 0.2,
        width_ratio: 0.2,
        height_ratio: 0.3,
        score: 0.7,
      },
    ];

    const candidates = pickNearestPersonFrameCandidates(rows, 10.1);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].trackId).toBe(1);
    expect(candidates[1].trackId).toBe(2);
    expect(candidates[0].tsSec).toBe(10.0);
  });

  it('returns empty when nearest frame is outside distance threshold', () => {
    const rows: PersonFrameRow[] = [
      {
        ts_sec: 15.0,
        track_id: 1,
        left_ratio: 0.1,
        top_ratio: 0.1,
        width_ratio: 0.2,
        height_ratio: 0.3,
        score: 0.8,
      },
    ];
    expect(pickNearestPersonFrameCandidates(rows, 10.0, 0.5)).toEqual([]);
  });
});
