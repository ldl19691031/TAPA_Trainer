export type FaceBox = {
  left: number;
  top: number;
  width: number;
  height: number;
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

export function normalizeFaceBox(
  topLeft: [number, number],
  bottomRight: [number, number],
  frameWidth: number,
  frameHeight: number,
  score: number,
): FaceBox | null {
  if (!(frameWidth > 0) || !(frameHeight > 0)) {
    return null;
  }
  const x1 = clamp01(topLeft[0] / frameWidth);
  const y1 = clamp01(topLeft[1] / frameHeight);
  const x2 = clamp01(bottomRight[0] / frameWidth);
  const y2 = clamp01(bottomRight[1] / frameHeight);

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.max(0, Math.abs(x2 - x1));
  const height = Math.max(0, Math.abs(y2 - y1));

  if (width < 0.01 || height < 0.01) {
    return null;
  }

  return {
    left,
    top,
    width,
    height,
    score: Number.isFinite(score) ? Math.max(0, Math.min(score, 1)) : 0,
  };
}

export function getDefaultFaceSelection(faceCount: number): number | null {
  return faceCount === 1 ? 0 : null;
}
