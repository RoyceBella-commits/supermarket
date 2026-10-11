"""Shared helpers for the BGM pipeline (ffmpeg I/O, loudness, true peak).

Imported by the other scripts via an explicit sys.path insert of this folder,
so the scripts can still be run with `python -I`.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess

import numpy as np
from scipy import signal

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BGM_DIR = os.path.join(REPO, "public", "audio", "bgm")


def _find(tool: str) -> str:
    env = os.environ.get(tool.upper())
    if env:
        return env
    for cand in (f"/opt/homebrew/bin/{tool}", shutil.which(tool)):
        if cand and os.path.exists(cand):
            return cand
    raise SystemExit(f"{tool} not found (set ${tool.upper()})")


FFMPEG = _find("ffmpeg")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def decode(path: str, sr: int = SR, channels: int = 2) -> np.ndarray:
    """Decode any audio file with ffmpeg -> float32 array (frames, channels).

    ffmpeg honours the MP4 edit list (AAC priming) and the LAME gapless
    header for MP3, so the result is what a gapless decoder returns.
    """
    cmd = [FFMPEG, "-v", "error", "-i", path, "-map", "0:a:0", "-vn",
           "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(channels), "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()


def encode_aac(wav_path: str, out_path: str, bitrate_k: int) -> list[str]:
    """Encode with AudioToolbox AAC (cvbr), TPDF-dithered to s16 (aac_at needs s16)."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    cmd = [FFMPEG, "-v", "error", "-y", "-i", wav_path,
           "-map", "0:a", "-map_metadata", "-1",
           "-af", "aresample=osf=s16:dither_method=triangular",
           "-c:a", "aac_at", "-aac_at_mode", "cvbr", "-b:a", f"{bitrate_k}k",
           "-ar", str(SR), "-movflags", "+faststart", out_path]
    subprocess.run(cmd, check=True)
    return cmd


def true_peak_dbtp(x: np.ndarray, sr: int = SR) -> float:
    """BS.1770-style true peak: 4x oversampling (polyphase FIR), max |sample|."""
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    up = 4 if sr <= 96000 else 2
    peak = 0.0
    for ch in range(x.shape[1]):
        y = signal.resample_poly(x[:, ch].astype(np.float64), up, 1)
        peak = max(peak, float(np.max(np.abs(y))))
    return 20 * np.log10(max(peak, 1e-12))


def sample_peak_db(x: np.ndarray) -> float:
    return 20 * np.log10(max(float(np.max(np.abs(x))), 1e-12))


def lufs(x: np.ndarray, sr: int = SR) -> float:
    """Integrated loudness (ITU-R BS.1770-4, gated) via pyloudnorm."""
    import pyloudnorm  # local import: only needed here

    return float(pyloudnorm.Meter(sr).integrated_loudness(x.astype(np.float64)))


def ebur128(path: str) -> dict:
    """Cross-check with ffmpeg's ebur128 filter: integrated LUFS, LRA, true peak."""
    cmd = [FFMPEG, "-nostats", "-hide_banner", "-i", path, "-map", "0:a:0",
           "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True, check=True).stderr
    summary = err[err.rfind("Summary:"):]
    out = {}
    m = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary)
    out["lufs"] = float(m.group(1)) if m else None
    m = re.search(r"LRA:\s+(-?[\d.]+) LU", summary)
    out["lra"] = float(m.group(1)) if m else None
    m = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summary)
    out["truePeakDbtp"] = float(m.group(1)) if m else None
    return out


def gain_for_target(target_lufs: float, measured_lufs: float, true_peak: float,
                    tp_ceiling: float = -1.0) -> tuple[float, bool]:
    """gainDb = target - lufs, clamped so peak + gain <= tp_ceiling."""
    g = target_lufs - measured_lufs
    limit = tp_ceiling - true_peak
    if g > limit:
        return round(limit, 2), True
    return round(g, 2), False
