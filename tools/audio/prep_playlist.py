#!/usr/bin/env python3
"""Public (CC0) playlist: Open Goldberg Variations (Kimiko Ishizaka) -> AAC .m4a + playlist.json.

Usage:
    python -I tools/audio/prep_playlist.py [--src-dir DIR] [--credits DIR/../credits.json]

For each track (fixed order: Aria -> Var. 13 -> Aria da Capo -> Var. 19):
  * decode the MP3 with ffmpeg (gapless, 48 kHz stereo float32)
  * trim leading/trailing silence/room tone (see trim()): start --pre-ms before the first
    note (10 ms fade-in); end --tail-sec (~0.3 s) after the final decay reaches the room-tone
    floor, with that last 0.3 s faded out.
  * scale down only if the true peak would exceed --tp-target (never needed for these sources)
  * encode aac_at cvbr 128k (TPDF dither to s16, no metadata/cover) -> public/audio/bgm/public/<id>.m4a
  * decode the .m4a back and measure integrated loudness (BS.1770-4) + true peak
  * gainDb = targetLufs - lufs, clamped so the true peak + gain stays <= -1 dBTP
Writes public/audio/bgm/playlist.json. Sources are not copied into the repo.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

TARGET_LUFS = -18.0
# Open Goldberg Variations 的 MP3 所在目录：用 --src-dir 传入，或设置环境变量 GOLDBERG_SRC
DEFAULT_SRC = os.environ.get("GOLDBERG_SRC")

# id, source file, credits.json key, title
TRACKS = [
    ("aria", "g00-aria.mp3", "g00-aria", "Goldberg Variations: Aria"),
    ("var13", "g13.mp3", "g13", "Goldberg Variations: Variation 13"),
    ("aria-da-capo", "g32-aria-da-capo.mp3", "g32-aria-da-capo", "Goldberg Variations: Aria da Capo"),
    ("var19", "g19.mp3", "g19", "Goldberg Variations: Variation 19"),
]


def frame_db(m: np.ndarray, frame: int) -> np.ndarray:
    n = len(m) // frame
    return 10 * np.log10(np.mean(m[: n * frame].astype(np.float64).reshape(n, frame) ** 2, axis=1) + 1e-20)


def trim(x: np.ndarray, sr: int, pre_ms: float, tail_sec: float, fade_in_ms: float) -> tuple[np.ndarray, dict]:
    """Trim leading/trailing room tone around the performance.

    loud = 95th percentile of 10 ms frame levels; a "note" frame is > loud - 20 dB.
    Start: first note frame - pre_ms (room tone fade-ins before it are dropped).
    End: room-tone floor = median level after the last note frame (digital silence excluded);
    the music ends where the 100 ms-smoothed decay falls to floor + 6 dB; keep tail_sec after it.
    """
    m = x.mean(axis=1)
    fr = sr // 100  # 10 ms
    db = frame_db(m, fr)
    live = db > -100
    loud = float(np.percentile(db[live], 95))
    note_thr = loud - 20.0
    notes = np.nonzero(db > note_thr)[0]
    onset, last_note = int(notes[0]), int(notes[-1])
    after = db[last_note + 1:]
    after = after[after > -100]
    floor = float(np.median(after)) if len(after) >= 10 else float(np.percentile(db[live], 5))
    p = 10 ** (db / 10)
    sm = 10 * np.log10(np.convolve(p, np.ones(10) / 10, mode="same") + 1e-20)
    end_thr = floor + 6.0
    tail_frames = np.nonzero(sm[last_note:] > end_thr)[0]
    end_music = last_note + (int(tail_frames[-1]) + 1 if len(tail_frames) else 1)
    start = max(0, onset * fr - int(pre_ms * sr / 1000))
    end = min(len(x), end_music * fr + int(tail_sec * sr))
    y = x[start:end].astype(np.float64).copy()
    n_in = int(fade_in_ms * sr / 1000)
    y[:n_in] *= (0.5 * (1 - np.cos(np.pi * (np.arange(n_in) + 0.5) / n_in)))[:, None]
    n_out = min(int(tail_sec * sr), len(y) // 4)
    y[-n_out:] *= (0.5 * (1 + np.cos(np.pi * (np.arange(n_out) + 0.5) / n_out)))[:, None]
    info = {"loudRefDb": round(loud, 1), "noteThresholdDb": round(note_thr, 1),
            "roomToneFloorDb": round(floor, 1), "endThresholdDb": round(end_thr, 1),
            "firstOnsetSec": round(onset * fr / sr, 3), "lastNoteSec": round(last_note * fr / sr, 3),
            "musicEndSec": round(end_music * fr / sr, 3),
            "trimStartSec": round(start / sr, 3), "trimEndSec": round(end / sr, 3),
            "sourceDurationSec": round(len(x) / sr, 3)}
    return y, info


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src-dir", default=DEFAULT_SRC, required=DEFAULT_SRC is None,
                    help="directory with g00-aria.mp3 etc. (or set GOLDBERG_SRC)")
    ap.add_argument("--credits", default=None, help="default: <src-dir>/../credits.json")
    ap.add_argument("--out-dir", default=os.path.join(common.BGM_DIR, "public"))
    ap.add_argument("--manifest", default=os.path.join(common.BGM_DIR, "playlist.json"))
    ap.add_argument("--bitrate", type=int, default=128)
    ap.add_argument("--pre-ms", type=float, default=50.0, help="room tone kept before the first note")
    ap.add_argument("--tail-sec", type=float, default=0.3, help="natural tail kept after the music (faded)")
    ap.add_argument("--fade-in-ms", type=float, default=10.0)
    ap.add_argument("--tp-target", type=float, default=-1.5, help="pre-encode true-peak ceiling (dBTP)")
    args = ap.parse_args()
    credits_path = args.credits or os.path.join(os.path.dirname(os.path.abspath(args.src_dir)), "credits.json")
    credits = json.load(open(credits_path, encoding="utf-8"))
    sr = common.SR
    os.makedirs(common.WORK, exist_ok=True)

    tracks, report = [], {}
    for tid, fname, ckey, title in TRACKS:
        src = os.path.join(args.src_dir, fname)
        x = common.decode(src)
        y, info = trim(x, sr, args.pre_ms, args.tail_sec, args.fade_in_ms)
        tp_pre = common.true_peak_dbtp(y, sr)
        scale_db = min(0.0, args.tp_target - tp_pre)
        y *= 10 ** (scale_db / 20)
        wav = os.path.join(common.WORK, f"public_{tid}.wav")
        sf.write(wav, y.astype(np.float32), sr, subtype="FLOAT")
        out = os.path.join(args.out_dir, f"{tid}.m4a")
        common.encode_aac(wav, out, args.bitrate)

        dec = common.decode(out)
        lufs = common.lufs(dec, sr)
        tp = common.true_peak_dbtp(dec, sr)
        eb = common.ebur128(out)
        gain, clamped = common.gain_for_target(TARGET_LUFS, lufs, tp)
        c = credits[ckey]
        track = {
            "id": tid,
            "title": title,
            "artist": "J. S. Bach — Kimiko Ishizaka",
            "file": f"public/{tid}.m4a",
            "sampleRate": sr,
            "lengthSamples": int(len(y)),
            "durationSec": round(len(y) / sr, 3),
            "loop": None,
            "lufs": round(lufs, 2),
            "gainDb": gain,
            "truePeakDbtp": round(tp, 2),
            "license": "CC0 (Open Goldberg Variations)",
            "source": c["page"],
            "encoder": f"aac_at cvbr {args.bitrate}k",
            "sourceSha256": common.sha256_file(src),
        }
        if clamped:
            track["gainClamped"] = True
        tracks.append(track)
        report[tid] = {**info, "scaleDbApplied": round(scale_db, 2), "truePeakPreEncode": round(tp_pre, 2),
                       "ffmpegEbur128": eb, "bytes": os.path.getsize(out), "decodedSamples": int(len(dec)),
                       "creditsLicense": c.get("license")}
        print(f"[{tid}] {fname}: trim {info['trimStartSec']:.3f}-{info['trimEndSec']:.3f} s of "
              f"{info['sourceDurationSec']:.3f} (first note {info['firstOnsetSec']} s, last note {info['lastNoteSec']} s, "
              f"room tone {info['roomToneFloorDb']} dB, decay ends {info['musicEndSec']} s) -> {len(y) / sr:.3f} s; {lufs:.2f} LUFS (ffmpeg {eb['lufs']}), "
              f"TP {tp:.2f} dBTP -> gainDb {gain:+.2f}{' (clamped by true peak)' if clamped else ''}; "
              f"{os.path.getsize(out) / 1024:.0f} KiB")

    common.write_json(args.manifest, {"version": 1, "targetLufs": TARGET_LUFS, "tracks": tracks})
    common.write_json(os.path.join(common.WORK, "playlist_report.json"), report)
    print(f"wrote {args.manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
