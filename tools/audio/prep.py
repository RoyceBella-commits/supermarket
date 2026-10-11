#!/usr/bin/env python3
"""Step 1: decode the source FLAC and resample to 48 kHz float32 (soxr VHQ).

Usage:
    python -I tools/audio/prep.py SOURCE.flac [--out tools/audio/work/bgm_48k.wav]

Also writes <out_dir>/source_info.json (sha256, original sr/channels/length)
which later steps copy into the manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

import numpy as np
import soundfile as sf
import soxr

TARGET_SR = 48000


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="input audio file (FLAC/WAV readable by libsndfile)")
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "work", "bgm_48k.wav"))
    args = ap.parse_args()

    info = sf.info(args.source)
    print(f"source: {info.samplerate} Hz, {info.channels} ch, {info.frames} frames "
          f"({info.frames / info.samplerate:.3f} s), subtype={info.subtype}")

    x, sr = sf.read(args.source, dtype="float32", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    elif x.shape[1] > 2:
        x = x[:, :2]

    if sr != TARGET_SR:
        y = soxr.resample(x, sr, TARGET_SR, quality="VHQ").astype(np.float32)
    else:
        y = x
    peak = float(np.max(np.abs(y)))
    print(f"resampled: {TARGET_SR} Hz, {y.shape[0]} frames ({y.shape[0] / TARGET_SR:.3f} s), "
          f"sample peak {20 * np.log10(max(peak, 1e-12)):.2f} dBFS")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sf.write(args.out, y, TARGET_SR, subtype="FLOAT")

    meta = {
        "source": os.path.basename(args.source),
        "sourceSha256": sha256_file(args.source),
        "sourceSampleRate": int(info.samplerate),
        "sourceChannels": int(info.channels),
        "sourceFrames": int(info.frames),
        "sourceSubtype": info.subtype,
        "sampleRate": TARGET_SR,
        "frames": int(y.shape[0]),
        "resampler": f"soxr {soxr.__version__} VHQ",
    }
    with open(os.path.join(os.path.dirname(os.path.abspath(args.out)), "source_info.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"wrote {args.out}")
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
