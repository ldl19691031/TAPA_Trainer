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
import subprocess
import time
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import tempfile

import cv2  # type: ignore
import numpy as np
import requests


class YoloXOnnxDetector:
  def __init__(
    self,
    model_path: str,
    conf_threshold: float = 0.35,
    nms_threshold: float = 0.5,
    input_size: tuple[int, int] = (640, 640),
  ) -> None:
    self.model_path = model_path
    self.conf_threshold = conf_threshold
    self.nms_threshold = nms_threshold
    self.input_size = input_size
    self.strides = [8, 16, 32]
    self.net = cv2.dnn.readNet(model_path)
    self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    self.grids, self.expanded_strides = self._generate_anchors()

  def _generate_anchors(self) -> tuple[np.ndarray, np.ndarray]:
    grids: list[np.ndarray] = []
    expanded_strides: list[np.ndarray] = []
    hsizes = [self.input_size[0] // stride for stride in self.strides]
    wsizes = [self.input_size[1] // stride for stride in self.strides]
    for hsize, wsize, stride in zip(hsizes, wsizes, self.strides):
      xv, yv = np.meshgrid(np.arange(hsize), np.arange(wsize))
      grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
      grids.append(grid)
      shape = grid.shape[:2]
      expanded_strides.append(np.full((*shape, 1), stride))
    return np.concatenate(grids, 1), np.concatenate(expanded_strides, 1)

  def _letterbox(self, frame: np.ndarray) -> tuple[np.ndarray, float]:
    target_h, target_w = self.input_size
    padded = np.ones((target_h, target_w, 3), dtype=np.float32) * 114.0
    ratio = min(target_h / frame.shape[0], target_w / frame.shape[1])
    resized = cv2.resize(
      frame,
      (int(frame.shape[1] * ratio), int(frame.shape[0] * ratio)),
      interpolation=cv2.INTER_LINEAR,
    ).astype(np.float32)
    padded[: resized.shape[0], : resized.shape[1]] = resized
    return padded, ratio

  def infer(self, frame: np.ndarray) -> np.ndarray:
    padded, ratio = self._letterbox(frame)
    blob = np.transpose(padded, (2, 0, 1))[np.newaxis, :, :, :]
    self.net.setInput(blob)
    outs = self.net.forward(self.net.getUnconnectedOutLayersNames())
    dets = outs[0][0]
    dets[:, :2] = (dets[:, :2] + self.grids) * self.expanded_strides
    dets[:, 2:4] = np.exp(dets[:, 2:4]) * self.expanded_strides

    boxes = dets[:, :4]
    boxes_xywh = np.ones_like(boxes)
    boxes_xywh[:, 0] = boxes[:, 0] - boxes[:, 2] / 2.0
    boxes_xywh[:, 1] = boxes[:, 1] - boxes[:, 3] / 2.0
    boxes_xywh[:, 2] = boxes[:, 2]
    boxes_xywh[:, 3] = boxes[:, 3]

    scores = dets[:, 4:5] * dets[:, 5:]
    max_scores = np.amax(scores, axis=1)
    class_ids = np.argmax(scores, axis=1)
    keep = cv2.dnn.NMSBoxesBatched(
      boxes_xywh.tolist(),
      max_scores.tolist(),
      class_ids.tolist(),
      self.conf_threshold,
      self.nms_threshold,
    )
    if keep is None or len(keep) == 0:
      return np.empty((0, 6), dtype=np.float32)

    keep_indices = np.array(keep).reshape(-1)
    candidates = np.concatenate([boxes_xywh, max_scores[:, None], class_ids[:, None]], axis=1)
    picked = candidates[keep_indices]
    picked[:, :4] = picked[:, :4] / ratio
    return picked


class NanoDetOnnxDetector:
  def __init__(
    self,
    model_path: str,
    conf_threshold: float = 0.35,
    nms_threshold: float = 0.6,
  ) -> None:
    self.strides = (8, 16, 32, 64)
    self.image_shape = (416, 416)
    self.reg_max = 7
    self.project = np.arange(self.reg_max + 1)
    self.conf_threshold = conf_threshold
    self.nms_threshold = nms_threshold
    self.mean = np.array([103.53, 116.28, 123.675], dtype=np.float32).reshape(1, 1, 3)
    self.std = np.array([57.375, 57.12, 58.395], dtype=np.float32).reshape(1, 1, 3)
    self.net = cv2.dnn.readNet(model_path)
    self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    self.anchors_mlvl: list[np.ndarray] = []
    for stride in self.strides:
      feat_h = int(self.image_shape[0] / stride)
      feat_w = int(self.image_shape[1] / stride)
      shift_x = np.arange(0, feat_w) * stride
      shift_y = np.arange(0, feat_h) * stride
      xv, yv = np.meshgrid(shift_x, shift_y)
      cx = xv.flatten() + 0.5 * (stride - 1)
      cy = yv.flatten() + 0.5 * (stride - 1)
      self.anchors_mlvl.append(np.column_stack((cx, cy)))

  def _letterbox(self, frame: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    target_h, target_w = self.image_shape
    img = frame.copy()
    top, left, newh, neww = 0, 0, target_h, target_w
    if img.shape[0] != img.shape[1]:
      hw_scale = img.shape[0] / img.shape[1]
      if hw_scale > 1:
        newh, neww = target_h, int(target_w / hw_scale)
        img = cv2.resize(img, (neww, newh), interpolation=cv2.INTER_AREA)
        left = int((target_w - neww) * 0.5)
        img = cv2.copyMakeBorder(img, 0, 0, left, target_w - neww - left, cv2.BORDER_CONSTANT, value=0)
      else:
        newh, neww = int(target_h * hw_scale), target_w
        img = cv2.resize(img, (neww, newh), interpolation=cv2.INTER_AREA)
        top = int((target_h - newh) * 0.5)
        img = cv2.copyMakeBorder(img, top, target_h - newh - top, 0, 0, cv2.BORDER_CONSTANT, value=0)
    else:
      img = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_AREA)
    return img, (top, left, newh, neww)

  def _unletterbox(
    self,
    bbox: np.ndarray,
    original_shape: tuple[int, int],
    letterbox_scale: tuple[int, int, int, int],
  ) -> np.ndarray:
    ret = bbox.copy()
    h, w = original_shape
    top, left, newh, neww = letterbox_scale
    if h == w:
      ratio = h / newh
      return ret * ratio
    ratioh, ratiow = h / newh, w / neww
    ret[0] = max((ret[0] - left) * ratiow, 0)
    ret[1] = max((ret[1] - top) * ratioh, 0)
    ret[2] = min((ret[2] - left) * ratiow, w)
    ret[3] = min((ret[3] - top) * ratioh, h)
    return ret

  def infer(self, frame: np.ndarray) -> np.ndarray:
    input_blob, letterbox_scale = self._letterbox(frame)
    img = input_blob.astype(np.float32)
    img = (img - self.mean) / self.std
    blob = cv2.dnn.blobFromImage(img)
    self.net.setInput(blob)
    outs = self.net.forward(self.net.getUnconnectedOutLayersNames())

    cls_scores = outs[::2]
    bbox_preds = outs[1::2]
    bboxes_mlvl: list[np.ndarray] = []
    scores_mlvl: list[np.ndarray] = []

    for stride, cls_score, bbox_pred, anchors in zip(self.strides, cls_scores, bbox_preds, self.anchors_mlvl):
      if cls_score.ndim == 3:
        cls_score = cls_score.squeeze(axis=0)
      if bbox_pred.ndim == 3:
        bbox_pred = bbox_pred.squeeze(axis=0)
      x_exp = np.exp(bbox_pred.reshape(-1, self.reg_max + 1))
      x_sum = np.sum(x_exp, axis=1, keepdims=True)
      bbox_pred = x_exp / x_sum
      bbox_pred = np.dot(bbox_pred, self.project).reshape(-1, 4)
      bbox_pred *= stride

      points = anchors
      x1 = np.clip(points[:, 0] - bbox_pred[:, 0], 0, self.image_shape[1])
      y1 = np.clip(points[:, 1] - bbox_pred[:, 1], 0, self.image_shape[0])
      x2 = np.clip(points[:, 0] + bbox_pred[:, 2], 0, self.image_shape[1])
      y2 = np.clip(points[:, 1] + bbox_pred[:, 3], 0, self.image_shape[0])
      bboxes_mlvl.append(np.column_stack([x1, y1, x2, y2]))
      scores_mlvl.append(cls_score)

    bboxes = np.concatenate(bboxes_mlvl, axis=0)
    scores = np.concatenate(scores_mlvl, axis=0)
    bboxes_wh = bboxes.copy()
    bboxes_wh[:, 2:4] = bboxes_wh[:, 2:4] - bboxes_wh[:, 0:2]
    class_ids = np.argmax(scores, axis=1)
    confidences = np.max(scores, axis=1)
    indices = cv2.dnn.NMSBoxes(
      bboxes_wh.tolist(),
      confidences.tolist(),
      self.conf_threshold,
      self.nms_threshold,
    )
    if indices is None or len(indices) == 0:
      return np.empty((0, 6), dtype=np.float32)

    keep = np.array(indices).reshape(-1)
    picked = np.concatenate([bboxes, confidences[:, None], class_ids[:, None]], axis=1)[keep]
    original_shape = (frame.shape[0], frame.shape[1])
    for row in picked:
      row[:4] = self._unletterbox(row[:4], original_shape, letterbox_scale)
    return picked


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


def extract_detections_yolo(result, frame_width: int, frame_height: int, min_score: float) -> list[Detection]:
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


def extract_detections_hog(
  frame: np.ndarray,
  frame_width: int,
  frame_height: int,
  min_score: float,
) -> list[Detection]:
  hog = cv2.HOGDescriptor()
  hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
  rects, weights = hog.detectMultiScale(
    frame, winStride=(8, 8), padding=(8, 8), scale=1.03
  )
  detections: list[Detection] = []
  for (x, y, w, h), score in zip(rects, weights):
    score_value = float(score)
    if score_value < min_score:
      continue
    detections.append(
      Detection(
        left=clamp01(float(x) / frame_width),
        top=clamp01(float(y) / frame_height),
        width=clamp01(float(w) / frame_width),
        height=clamp01(float(h) / frame_height),
        score=min(1.0, max(0.0, score_value)),
        polygon=None,
      )
    )
  return detections


def extract_detections_yolox_onnx(
  frame: np.ndarray,
  detector: YoloXOnnxDetector,
  frame_width: int,
  frame_height: int,
  min_score: float,
) -> list[Detection]:
  predictions = detector.infer(frame)
  detections: list[Detection] = []
  for row in predictions:
    x, y, w, h, score, class_id = row.tolist()
    if int(class_id) != 0:
      continue
    score_value = float(score)
    if score_value < min_score:
      continue
    detections.append(
      Detection(
        left=clamp01(float(x) / frame_width),
        top=clamp01(float(y) / frame_height),
        width=clamp01(float(w) / frame_width),
        height=clamp01(float(h) / frame_height),
        score=min(1.0, max(0.0, score_value)),
        polygon=None,
      )
    )
  return detections


def extract_detections_nanodet_onnx(
  frame: np.ndarray,
  detector: NanoDetOnnxDetector,
  frame_width: int,
  frame_height: int,
  min_score: float,
) -> list[Detection]:
  predictions = detector.infer(frame)
  detections: list[Detection] = []
  for row in predictions:
    x1, y1, x2, y2, score, class_id = row.tolist()
    if int(class_id) != 0:
      continue
    score_value = float(score)
    if score_value < min_score:
      continue
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    detections.append(
      Detection(
        left=clamp01(float(x1) / frame_width),
        top=clamp01(float(y1) / frame_height),
        width=clamp01(float(w) / frame_width),
        height=clamp01(float(h) / frame_height),
        score=min(1.0, max(0.0, score_value)),
        polygon=None,
      )
    )
  return detections


def extract_sampled_frames_ffmpeg(
  video_path: Path,
  sample_fps: float,
  start_sec: float,
  end_sec: float | None,
) -> list[tuple[Path, float]]:
  with tempfile.TemporaryDirectory(prefix="tapa_frames_") as temp_dir_raw:
    temp_dir = Path(temp_dir_raw)
    frame_pattern = temp_dir / "frame_%06d.jpg"
    command = [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
    ]
    if start_sec > 0:
      command.extend(["-ss", f"{start_sec:.3f}"])
    command.extend(["-i", str(video_path)])
    if end_sec is not None and end_sec > start_sec:
      command.extend(["-to", f"{end_sec:.3f}"])
    command.extend(["-vf", f"fps={sample_fps:.6f}", str(frame_pattern)])
    subprocess.run(command, check=True)

    frame_paths = sorted(temp_dir.glob("frame_*.jpg"))
    extracted: list[tuple[Path, float]] = []
    for index, frame_path in enumerate(frame_paths):
      ts_sec = start_sec + (index / sample_fps)
      stable_copy = video_path.parent / ".tapa_tmp_frames" / frame_path.name
      stable_copy.parent.mkdir(parents=True, exist_ok=True)
      shutil.copy2(frame_path, stable_copy)
      extracted.append((stable_copy, ts_sec))
    return extracted


def cleanup_extracted_frames(paths: list[tuple[Path, float]]) -> None:
  for frame_path, _ in paths:
    if frame_path.exists():
      frame_path.unlink(missing_ok=True)
  temp_dir = paths[0][0].parent if paths else None
  if temp_dir and temp_dir.exists():
    try:
      temp_dir.rmdir()
    except OSError:
      pass


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
  parser.add_argument(
    "--backend",
    choices=["yolo", "hog", "yolox_onnx", "nanodet_onnx"],
    default="yolo",
    help="Detection backend",
  )
  parser.add_argument("--sample-fps", type=float, default=2.0, help="Sampling FPS for analysis")
  parser.add_argument("--start-sec", type=float, default=0.0, help="Optional start second")
  parser.add_argument("--end-sec", type=float, default=-1.0, help="Optional end second")
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
  end_sec = args.end_sec if args.end_sec > 0 else None
  frame_items = extract_sampled_frames_ffmpeg(
    video_path=video_path,
    sample_fps=args.sample_fps,
    start_sec=max(0.0, args.start_sec),
    end_sec=end_sec,
  )
  if not frame_items:
    raise RuntimeError("No frames extracted. Check video path and time range.")

  model = None
  yolox_detector = None
  nanodet_detector = None
  if args.backend == "yolo":
    try:
      from ultralytics import YOLO  # type: ignore

      model = YOLO(args.model)
    except Exception as exc:  # pragma: no cover
      raise RuntimeError(
        f"Failed to initialize YOLO backend ({exc}). "
        "Use --backend hog as a fallback."
      ) from exc
  elif args.backend == "yolox_onnx":
    try:
      yolox_detector = YoloXOnnxDetector(model_path=args.model, conf_threshold=args.min_score)
    except Exception as exc:  # pragma: no cover
      raise RuntimeError(
        f"Failed to initialize YOLOX ONNX backend ({exc}). "
        "Ensure --model points to a valid .onnx model."
      ) from exc
  elif args.backend == "nanodet_onnx":
    try:
      nanodet_detector = NanoDetOnnxDetector(model_path=args.model, conf_threshold=args.min_score)
    except Exception as exc:  # pragma: no cover
      raise RuntimeError(
        f"Failed to initialize NanoDet ONNX backend ({exc}). "
        "Ensure --model points to a valid .onnx model."
      ) from exc
  tracker = IoUTracker()
  rows: list[dict] = []

  started = time.time()
  frame_count = len(frame_items)
  try:
    for frame_index, (frame_path, ts_sec) in enumerate(frame_items, start=1):
      frame = cv2.imread(str(frame_path))
      if frame is None:
        continue
      if args.backend == "yolo":
        result = model.predict(frame, verbose=False)[0]
        detections = extract_detections_yolo(
          result=result,
          frame_width=frame.shape[1],
          frame_height=frame.shape[0],
          min_score=args.min_score,
        )
      else:
        if args.backend == "hog":
          detections = extract_detections_hog(
            frame=frame,
            frame_width=frame.shape[1],
            frame_height=frame.shape[0],
            min_score=args.min_score,
          )
        else:
          if args.backend == "yolox_onnx":
            detections = extract_detections_yolox_onnx(
              frame=frame,
              detector=yolox_detector,
              frame_width=frame.shape[1],
              frame_height=frame.shape[0],
              min_score=args.min_score,
            )
          else:
            detections = extract_detections_nanodet_onnx(
              frame=frame,
              detector=nanodet_detector,
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
      if frame_index % 100 == 0:
        print(f"Processed sampled frames: {frame_index}/{frame_count}, rows={len(rows)}")
  finally:
    cleanup_extracted_frames(frame_items)

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
