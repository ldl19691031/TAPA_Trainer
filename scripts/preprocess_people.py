#!/usr/bin/env python3
"""
Offline person segmentation + lightweight tracking for TAPA trainer videos.

Usage example:
  python scripts/preprocess_people.py \
    --video-path "F:/Source/TAPAVideoTrainer/videos/sample.mp4" \
    --video-id "00000000-0000-0000-0000-000000000000" \
    --output-json "tmp/person_frames.json" \
    --sample-fps 2

Optional write to Supabase REST:
  python scripts/preprocess_people.py ... \
    --supabase-url "https://<ref>.supabase.co" \
    --supabase-service-key "<service_role>" \
    --write-db
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2  # type: ignore
import numpy as np
import requests
from ultralytics import YOLO  # type: ignore


@dataclass
class Detection:
  left: float
  top: float
  width: float
  height: float
  score: float
  polygon: list[list[float]] | None


@dataclass
class Track:
  track_id: int
  left: float
  top: float
  width: float
  height: float
  score: float
  stale_count: int = 0


def iou(a: Detection | Track, b: Detection | Track) -> float:
  ax1, ay1 = a.left, a.top
  ax2, ay2 = a.left + a.width, a.top + a.height
  bx1, by1 = b.left, b.top
  bx2, by2 = b.left + b.width, b.top + b.height

  ix1 = max(ax1, bx1)
  iy1 = max(ay1, by1)
  ix2 = min(ax2, bx2)
  iy2 = min(ay2, by2)
  if ix2 <= ix1 or iy2 <= iy1:
    return 0.0
  inter = (ix2 - ix1) * (iy2 - iy1)
  area_a = max(1e-8, (ax2 - ax1) * (ay2 - ay1))
  area_b = max(1e-8, (bx2 - bx1) * (by2 - by1))
  return inter / (area_a + area_b - inter)


class IoUTracker:
  def __init__(self, iou_threshold: float = 0.35, max_stale: int = 8):
    self.iou_threshold = iou_threshold
    self.max_stale = max_stale
    self.tracks: dict[int, Track] = {}
    self.next_track_id = 1

  def update(self, detections: list[Detection]) -> list[tuple[int, Detection]]:
    assignments: list[tuple[int, Detection]] = []
    used_tracks: set[int] = set()
    used_dets: set[int] = set()

    candidates: list[tuple[float, int, int]] = []
    for det_index, det in enumerate(detections):
      for track_id, track in self.tracks.items():
        score = iou(track, det)
        if score >= self.iou_threshold:
          candidates.append((score, track_id, det_index))
    candidates.sort(reverse=True)

    for _, track_id, det_index in candidates:
      if track_id in used_tracks or det_index in used_dets:
        continue
      used_tracks.add(track_id)
      used_dets.add(det_index)
      det = detections[det_index]
      self.tracks[track_id] = Track(
        track_id=track_id,
        left=det.left,
        top=det.top,
        width=det.width,
        height=det.height,
        score=det.score,
        stale_count=0,
      )
      assignments.append((track_id, det))

    for det_index, det in enumerate(detections):
      if det_index in used_dets:
        continue
      track_id = self.next_track_id
      self.next_track_id += 1
      self.tracks[track_id] = Track(
        track_id=track_id,
        left=det.left,
        top=det.top,
        width=det.width,
        height=det.height,
        score=det.score,
        stale_count=0,
      )
      assignments.append((track_id, det))

    for track_id in list(self.tracks.keys()):
      if track_id in used_tracks:
        continue
      self.tracks[track_id].stale_count += 1
      if self.tracks[track_id].stale_count > self.max_stale:
        del self.tracks[track_id]

    return assignments


def clamp01(value: float) -> float:
  if value < 0:
    return 0.0
  if value > 1:
    return 1.0
  return float(value)


def extract_detections(result, frame_width: int, frame_height: int, min_score: float) -> list[Detection]:
  detections: list[Detection] = []
  boxes = result.boxes
  masks = result.masks
  if boxes is None:
    return detections

  for index in range(len(boxes)):
    cls = int(boxes.cls[index].item())
    score = float(boxes.conf[index].item())
    if cls != 0 or score < min_score:
      continue
    xyxy = boxes.xyxy[index].cpu().numpy()
    x1, y1, x2, y2 = xyxy.tolist()
    left = clamp01(x1 / frame_width)
    top = clamp01(y1 / frame_height)
    width = clamp01((x2 - x1) / frame_width)
    height = clamp01((y2 - y1) / frame_height)
    if width < 0.01 or height < 0.01:
      continue

    polygon: list[list[float]] | None = None
    if masks is not None and masks.xyn is not None and index < len(masks.xyn):
      points = masks.xyn[index]
      if points is not None and len(points) >= 3:
        polygon = [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in points]

    detections.append(
      Detection(
        left=left,
        top=top,
        width=width,
        height=height,
        score=min(1.0, max(0.0, score)),
        polygon=polygon,
      )
    )
  return detections


def iter_sampled_frames(cap: cv2.VideoCapture, sample_fps: float) -> Iterable[tuple[int, float, np.ndarray]]:
  fps = cap.get(cv2.CAP_PROP_FPS)
  if not fps or fps <= 0:
    fps = 25.0
  frame_interval = max(1, int(round(fps / sample_fps)))

  frame_index = 0
  while True:
    ok, frame = cap.read()
    if not ok:
      break
    if frame_index % frame_interval == 0:
      ts_sec = frame_index / fps
      yield frame_index, ts_sec, frame
    frame_index += 1


def write_json(path: Path, rows: list[dict]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8", newline="\n") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)


def write_csv(path: Path, rows: list[dict]) -> None:
  import csv

  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = [
    "video_id",
    "ts_sec",
    "track_id",
    "left_ratio",
    "top_ratio",
    "width_ratio",
    "height_ratio",
    "score",
    "mask_polygon",
  ]
  with path.open("w", encoding="utf-8", newline="\n") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
      writer.writerow(
        {
          **row,
          "mask_polygon": json.dumps(row["mask_polygon"], ensure_ascii=False)
          if row.get("mask_polygon") is not None
          else "",
        }
      )


def upsert_supabase_rows(
  supabase_url: str,
  service_key: str,
  rows: list[dict],
  chunk_size: int = 400,
) -> None:
  endpoint = f"{supabase_url}/rest/v1/video_person_frames?on_conflict=video_id,ts_sec,track_id"
  headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
  }

  total = len(rows)
  for start in range(0, total, chunk_size):
    chunk = rows[start : start + chunk_size]
    response = requests.post(endpoint, headers=headers, data=json.dumps(chunk), timeout=60)
    if response.status_code >= 300:
      raise RuntimeError(
        f"Supabase upsert failed: status={response.status_code}, body={response.text}"
      )
    print(f"Upserted {min(start + chunk_size, total)}/{total} rows")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Offline person segmentation pipeline")
  parser.add_argument("--video-path", required=True, help="Absolute path to local mp4 file")
  parser.add_argument("--video-id", required=True, help="videos.id in Supabase")
  parser.add_argument("--model", default="yolov8n-seg.pt", help="Ultralytics segmentation model")
  parser.add_argument("--sample-fps", type=float, default=2.0, help="Sampling FPS for analysis")
  parser.add_argument("--min-score", type=float, default=0.35, help="Confidence threshold")
  parser.add_argument("--output-json", default="", help="Optional output json path")
  parser.add_argument("--output-csv", default="", help="Optional output csv path")
  parser.add_argument("--supabase-url", default="", help="Optional Supabase URL")
  parser.add_argument("--supabase-service-key", default="", help="Optional service role key")
  parser.add_argument("--write-db", action="store_true", help="Write rows to Supabase")
  parser.add_argument("--keep-mask", action="store_true", help="Store segmentation polygon in mask_polygon")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  video_path = Path(args.video_path)
  if not video_path.exists():
    raise FileNotFoundError(f"Video not found: {video_path}")

  cap = cv2.VideoCapture(str(video_path))
  if not cap.isOpened():
    raise RuntimeError(f"Cannot open video: {video_path}")

  model = YOLO(args.model)
  tracker = IoUTracker()
  rows: list[dict] = []

  started = time.time()
  frame_count = 0
  try:
    for frame_idx, ts_sec, frame in iter_sampled_frames(cap, args.sample_fps):
      frame_count += 1
      result = model.predict(frame, verbose=False)[0]
      detections = extract_detections(
        result=result,
        frame_width=frame.shape[1],
        frame_height=frame.shape[0],
        min_score=args.min_score,
      )
      assignments = tracker.update(detections)
      for track_id, det in assignments:
        rows.append(
          {
            "video_id": args.video_id,
            "ts_sec": round(ts_sec, 2),
            "track_id": int(track_id),
            "left_ratio": round(det.left, 5),
            "top_ratio": round(det.top, 5),
            "width_ratio": round(det.width, 5),
            "height_ratio": round(det.height, 5),
            "score": round(det.score, 5),
            "mask_polygon": det.polygon if args.keep_mask else None,
          }
        )
      if frame_count % 100 == 0:
        print(f"Processed sampled frames: {frame_count}, rows={len(rows)}")
  finally:
    cap.release()

  elapsed = time.time() - started
  print(f"Done. sampled_frames={frame_count}, rows={len(rows)}, elapsed={elapsed:.1f}s")

  if args.output_json:
    write_json(Path(args.output_json), rows)
    print(f"Wrote JSON: {args.output_json}")
  if args.output_csv:
    write_csv(Path(args.output_csv), rows)
    print(f"Wrote CSV: {args.output_csv}")

  if args.write_db:
    if not args.supabase_url or not args.supabase_service_key:
      raise RuntimeError("--write-db requires --supabase-url and --supabase-service-key")
    upsert_supabase_rows(args.supabase_url, args.supabase_service_key, rows)
    print("Supabase upsert completed.")


if __name__ == "__main__":
  main()
