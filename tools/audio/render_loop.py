#!/usr/bin/env python3
"""Step 3+4: render the loop file for one candidate and encode it to AAC.

Usage:
    python -I tools/audio/render_loop.py --cand 0 [--no-encode]

Output layout (all indices relative to the OUTPUT file, S0 = 0; F ~ 120 ms crossfade,
G = --xfade-guard-ms, default 50 ms; with G = 0 this is exactly the original spec):
    out = x[S0 : B + tail]
    out[B-G-F : B-G]    = x[B-G-F:B-G]*fade_out + x[A-G-F:A-G]*fade_in   (seam crossfade)
    out[B-G : B+tail]   = x[A-G : A+tail]   (A-side copy; the 1 s tail lets decoder look-ahead land on music)
    out[0 : 5 ms]       faded in
    loopStart = A - S0, loopEnd = B - S0  -> the game plays 0 -> loopEnd, then jumps to loopStart.
Why the guard G: if a decoder fails to strip the AAC priming (2112 samples = 44 ms), every
sample arrives d samples late and the jump happens at content position loopEnd - d. With G >= d
that position is still inside the pure A-side copy, so the jump stays sample-continuous (a
negative d is covered by the tail). Without G the jump would cut through the crossfade.
Equal-power crossfade by default; equal-gain (raised cosine) when the two crossfaded
segments are strongly correlated (rho > 0.8) to avoid a +3 dB bump.
The whole file is scaled down if needed so its true peak is <= --tp-target (dBTP).
Writes work/loop.wav (float32) + work/loop_meta.json and encodes
public/audio/bgm/local/reminiscence.m4a (aac_at cvbr 160k).
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cand", type=int, default=0, help="rank in work/candidates.json")
    ap.add_argument("--wav", default=os.path.join(common.WORK, "bgm_48k.wav"))
    ap.add_argument("--candidates", default=os.path.join(common.WORK, "candidates.json"))
    ap.add_argument("--out", default=os.path.join(common.WORK, "loop.wav"))
    ap.add_argument("--m4a", default=os.path.join(common.BGM_DIR, "local", "reminiscence.m4a"))
    ap.add_argument("--bitrate", type=int, default=160)
    ap.add_argument("--xfade-ms", type=float, default=120.0)
    ap.add_argument("--xfade-guard-ms", type=float, default=50.0,
                    help="end the crossfade this long before loopEnd (tolerates un-trimmed AAC priming)")
    ap.add_argument("--curve", choices=["auto", "power", "gain"], default="auto")
    ap.add_argument("--rho-gain", type=float, default=0.8, help="auto: equal-gain if correlation > this")
    ap.add_argument("--tail-sec", type=float, default=1.0)
    ap.add_argument("--fade-in-ms", type=float, default=5.0)
    ap.add_argument("--fade-out-ms", type=float, default=20.0, help="fade at the very end of the tail (never heard)")
    ap.add_argument("--tp-target", type=float, default=-1.5,
                    help="pre-encode true-peak ceiling in dBTP (margin for AAC overshoot; verify.py checks <= -1)")
    ap.add_argument("--no-encode", action="store_true")
    args = ap.parse_args()

    with open(args.candidates) as f:
        cj = json.load(f)
    c = cj["candidates"][args.cand]
    x, sr = sf.read(args.wav, dtype="float64", always_2d=True)
    assert sr == common.SR
    S0 = int(cj["S0"]["sample"])
    A = int(c["A"]["sample"])
    B = int(c["B"]["sample"])
    F = int(round(args.xfade_ms * sr / 1000))
    G = int(round(args.xfade_guard_ms * sr / 1000))
    tail = int(round(args.tail_sec * sr))
    assert S0 + F + G < A - F - G and A + tail < B and B + tail <= len(x)

    out = x[S0:B + tail].copy()
    a, b = A - S0, B - S0  # output coordinates

    seg_b = x[B - G - F:B - G]
    seg_a = x[A - G - F:A - G]
    rho = float(np.corrcoef(seg_b.ravel(), seg_a.ravel())[0, 1])
    curve = args.curve if args.curve != "auto" else ("gain" if rho > args.rho_gain else "power")
    t = (np.arange(F) + 0.5) / F
    if curve == "power":
        fo, fi = np.cos(0.5 * np.pi * t), np.sin(0.5 * np.pi * t)
    else:  # equal-gain raised cosine
        fo = 0.5 * (1 + np.cos(np.pi * t))
        fi = 1.0 - fo
    out[b - G - F:b - G] = seg_b * fo[:, None] + seg_a * fi[:, None]
    out[b - G:b + tail] = x[A - G:A + tail]

    n_in = int(round(args.fade_in_ms * sr / 1000))
    out[:n_in] *= (0.5 * (1 - np.cos(np.pi * (np.arange(n_in) + 0.5) / n_in)))[:, None]
    n_out = int(round(args.fade_out_ms * sr / 1000))
    out[-n_out:] *= (0.5 * (1 + np.cos(np.pi * (np.arange(n_out) + 0.5) / n_out)))[:, None]

    # seam sanity: continuity across the jump (loopEnd-1 -> loopStart) in the rendered file
    jump_step = float(np.max(np.abs(out[b - 1] - out[a])))
    typical_step = float(np.median(np.max(np.abs(np.diff(out[a:a + sr], axis=0)), axis=1)))

    tp0 = common.true_peak_dbtp(out, sr)
    gain_db = min(0.0, args.tp_target - tp0)
    out *= 10 ** (gain_db / 20)
    tp1 = common.true_peak_dbtp(out, sr)

    sf.write(args.out, out.astype(np.float32), sr, subtype="FLOAT")
    meta = {
        "candidateRank": args.cand,
        "candidate": c,
        "sampleRate": sr,
        "sourceIndices": {"S0": S0, "A": A, "B": B},
        "lengthSamples": int(len(out)),
        "durationSec": round(len(out) / sr, 6),
        "loop": {"startSample": a, "endSample": b, "crossfadeMs": args.xfade_ms},
        "loopSec": {"start": round(a / sr, 6), "end": round(b / sr, 6), "body": round((b - a) / sr, 6)},
        "crossfade": {"samples": F, "guardSamples": G, "curve": curve, "rho": round(rho, 4),
                      "regionOutput": [b - G - F, b - G]},
        "tailSamples": tail,
        "fadeInMs": args.fade_in_ms,
        "gainDbApplied": round(gain_db, 3),
        "truePeakDbtpBefore": round(tp0, 3),
        "truePeakDbtpAfter": round(tp1, 3),
        "jumpStep": jump_step, "medianSampleStep": typical_step,
    }
    common.write_json(os.path.join(os.path.dirname(os.path.abspath(args.out)), "loop_meta.json"), meta)
    print(f"[render] S0={S0} A={A} ({A / sr:.4f} s) B={B} ({B / sr:.4f} s) in source")
    print(f"[render] output {len(out)} samples ({len(out) / sr:.3f} s); loopStart={a} ({a / sr:.4f} s) "
          f"loopEnd={b} ({b / sr:.4f} s); body {(b - a) / sr:.4f} s")
    print(f"[render] crossfade {F} samples ending {G} samples before loopEnd, rho={rho:.3f} -> {curve}; jump step {jump_step:.2e} "
          f"(median step {typical_step:.2e})")
    print(f"[render] true peak {tp0:.2f} dBTP -> gain {gain_db:+.2f} dB -> {tp1:.2f} dBTP; wrote {args.out}")

    if not args.no_encode:
        cmd = common.encode_aac(args.out, args.m4a, args.bitrate)
        print("[encode] " + " ".join(repr(p) if " " in p else p for p in cmd))
        print(f"[encode] wrote {args.m4a} ({os.path.getsize(args.m4a) / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
