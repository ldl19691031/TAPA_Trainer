export type AnnotationLike = {
  start_sec: number;
  end_sec: number;
  drivers: string[];
};

export type MergeCluster<T extends AnnotationLike> = {
  start_sec: number;
  end_sec: number;
  annotations: T[];
  driverCount: Record<string, number>;
};

export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function normalizeSegment(
  start: number,
  end: number,
  snapStepSeconds: number,
  minSegmentSeconds: number,
): { start: number; end: number } {
  const snappedStart = Math.max(0, snapToStep(start, snapStepSeconds));
  const snappedEnd = Math.max(0, snapToStep(end, snapStepSeconds));
  const adjustedEnd =
    snappedEnd - snappedStart >= minSegmentSeconds
      ? snappedEnd
      : snapToStep(snappedStart + minSegmentSeconds, snapStepSeconds);
  return { start: snappedStart, end: adjustedEnd };
}

export function overlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  if (overlap <= 0) {
    return 0;
  }
  const base = Math.max(0.0001, Math.min(aEnd - aStart, bEnd - bStart));
  return overlap / base;
}

export function buildMergeClusters<T extends AnnotationLike>(
  rows: T[],
  mergeThreshold: number,
): MergeCluster<T>[] {
  const sorted = [...rows].sort((a, b) => a.start_sec - b.start_sec);
  const clusters: MergeCluster<T>[] = [];
  for (const row of sorted) {
    const match = clusters.find((cluster) => {
      return overlapRatio(row.start_sec, row.end_sec, cluster.start_sec, cluster.end_sec) >= mergeThreshold;
    });
    if (!match) {
      const driverCount: Record<string, number> = {};
      for (const driver of row.drivers) {
        driverCount[driver] = (driverCount[driver] ?? 0) + 1;
      }
      clusters.push({
        start_sec: row.start_sec,
        end_sec: row.end_sec,
        annotations: [row],
        driverCount,
      });
      continue;
    }
    match.start_sec = Math.min(match.start_sec, row.start_sec);
    match.end_sec = Math.max(match.end_sec, row.end_sec);
    match.annotations.push(row);
    for (const driver of row.drivers) {
      match.driverCount[driver] = (match.driverCount[driver] ?? 0) + 1;
    }
  }
  return clusters.sort((a, b) => a.start_sec - b.start_sec);
}

export function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const tenths = Math.round((value - Math.floor(value)) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

