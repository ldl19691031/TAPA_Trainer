export type NormalizedBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PersonFrameRow = {
  ts_sec: number;
  track_id: number;
  left_ratio: number;
  top_ratio: number;
  width_ratio: number;
  height_ratio: number;
  score: number | null;
};

export type PersonCandidate = {
  tsSec: number;
  trackId: number;
  box: NormalizedBox;
  score: number;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

function normalizeBox(row: PersonFrameRow): NormalizedBox | null {
  const left = clamp01(row.left_ratio);
  const top = clamp01(row.top_ratio);
  const width = clamp01(row.width_ratio);
  const height = clamp01(row.height_ratio);
  if (width < 0.01 || height < 0.01) {
    return null;
  }
  return { left, top, width, height };
}

export function pickNearestPersonFrameCandidates(
  rows: PersonFrameRow[],
  currentTime: number,
  maxDistance = 0.8,
): PersonCandidate[] {
  if (!Number.isFinite(currentTime) || rows.length === 0) {
    return [];
  }
  const uniqueTs = [...new Set(rows.map((row) => row.ts_sec))];
  const nearestTs = uniqueTs.reduce((best, ts) => {
    if (best === null) {
      return ts;
    }
    return Math.abs(ts - currentTime) < Math.abs(best - currentTime) ? ts : best;
  }, null as number | null);
  if (nearestTs === null || Math.abs(nearestTs - currentTime) > maxDistance) {
    return [];
  }

  return rows
    .filter((row) => row.ts_sec === nearestTs)
    .map((row) => {
      const box = normalizeBox(row);
      if (!box) {
        return null;
      }
      return {
        tsSec: nearestTs,
        trackId: row.track_id,
        box,
        score: Number.isFinite(row.score ?? NaN) ? Math.max(0, Math.min(1, row.score ?? 0)) : 0,
      } satisfies PersonCandidate;
    })
    .filter((candidate): candidate is PersonCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score || a.trackId - b.trackId);
}
