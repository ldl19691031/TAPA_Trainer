#!/usr/bin/env python3
"""
Batch import preprocessed person frame JSON files through app API.

Usage:
  python scripts/import_person_frames.py \
    --api-base-url "https://tadriver.godofpenblog.top" \
    --access-token "<supabase_access_token>" \
    --input-json "F:/Source/TAPAVideoTrainer/tmp/person_frames_yuhua.json" \
    --input-json "F:/Source/TAPAVideoTrainer/tmp/person_frames_linyi.json"
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Import preprocessed person frame rows")
  parser.add_argument("--api-base-url", required=True, help="App base URL, e.g. https://tadriver.godofpenblog.top")
  parser.add_argument("--access-token", required=True, help="Supabase user access token")
  parser.add_argument("--input-json", action="append", required=True, help="JSON file path (repeatable)")
  parser.add_argument("--chunk-size", type=int, default=500, help="Rows per API request")
  return parser.parse_args()


def import_rows(base_url: str, access_token: str, rows: list[dict], chunk_size: int) -> None:
  endpoint = f"{base_url.rstrip('/')}/api/person-frames/import"
  headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json",
  }
  total = len(rows)
  for start in range(0, total, chunk_size):
    chunk = rows[start : start + chunk_size]
    response = requests.post(endpoint, headers=headers, json={"rows": chunk}, timeout=60)
    if response.status_code >= 300:
      raise RuntimeError(f"Import failed [{response.status_code}]: {response.text}")
    print(f"Imported {min(start + chunk_size, total)}/{total}")


def main() -> None:
  args = parse_args()
  for input_path in args.input_json:
    path = Path(input_path)
    if not path.exists():
      raise FileNotFoundError(f"Input not found: {path}")
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
      print(f"Skip empty file: {path}")
      continue
    print(f"Importing {path.name}: {len(rows)} rows")
    import_rows(
      base_url=args.api_base_url,
      access_token=args.access_token,
      rows=rows,
      chunk_size=args.chunk_size,
    )
  print("All imports completed.")


if __name__ == "__main__":
  main()
