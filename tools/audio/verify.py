#!/usr/bin/env python3
"""Step 5: verify the encoded loop, render listening files, measure, write the local manifest.

Usage:
    python -I tools/audio/verify.py [--no-manifest]

* Decodes public/audio/bgm/local/reminiscence.m4a with ffmpeg and cross-correlates it
  with work/loop.wav at several positions to measure the decode offset (AAC priming).
* Simulates the game exactly (play 0 -> loopEnd, jump to loopStart, ...) on the DECODED audio:
    work/seam_test.wav   3 x [8 s before loopEnd -> jump -> 8 s after loopStart], 1 s silence between
    work/full_2loops.wav intro + body + body, then 4 s of the third pass (so both seams are heard)
* Seam metrics (frame RMS jump, spectral flux, HF click energy) at the seam vs the track's
  median / p95 and vs the same window at the natural loopStart position in the first pass.
* Integrated loudness (pyloudnorm BS.1770-4, cross-checked with ffmpeg ebur128) + true peak.
* Writes public/audio/bgm/playlist.local.json.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy import signal

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

TARGET_LUFS = -18.0


def xcorr_lag(ref: np.ndarray, test: np.ndarray, pos: int, n: int, search: int) -> tuple[int, float]:
    """Lag L such that test[pos+L : pos+L+n] best matches ref[pos : pos+n]."""
    r = ref[pos:pos + n]
    lo = max(0, pos - search)
    t = test[lo:pos + n + search]
    c = signal.correlate(t, r, mode="valid", method="fft")
    i = int(np.argmax(c))
    lag = lo + i - pos
    seg = test[pos + lag:pos + lag + n]
    ncc = float(np.dot(seg, r) / (np.linalg.norm(seg) * np.linalg.norm(r) + 1e-20))
    return lag, ncc


def frame_metrics(m: np.ndarray, sr: int, n_fft: int = 2048, hop: int = 256):
    f, t, Z = signal.stft(m, fs=sr, nperseg=n_fft, noverlap=n_fft - hop, boundary=None, padded=False)
    band = (f >= 40) & (f <= 16000)
    mag = np.abs(Z[band]) + 1e-9
    logmag = 20 * np.log10(mag)
    rms_db = 10 * np.log10(np.mean(np.abs(Z) ** 2, axis=0) + 1e-20)
    flux = np.concatenate([[0.0], np.mean(np.abs(np.diff(logmag, axis=1)), axis=0)])  # mean |dB| per frame
    jump = np.concatenate([[0.0], np.abs(np.diff(rms_db))])
    centers = t  # seconds (frame centres, boundary=None -> first centre at n_fft/2)
    return centers, rms_db, flux, jump


def hf_click(m: np.ndarray, sr: int, pos: int, win_ms: float = 2.0) -> tuple[float, float]:
    """High-passed (> 5 kHz) energy in a 2 ms window at pos vs the median 2 ms window."""
    sos = signal.butter(4, 5000, "highpass", fs=sr, output="sos")
    h = signal.sosfiltfilt(sos, m)
    w = int(sr * win_ms / 1000)
    n = len(h) // w
    e = 10 * np.log10(np.mean(h[: n * w].reshape(n, w) ** 2, axis=1) + 1e-20)
    k = pos // w
    local = float(np.max(e[max(0, k - 1):k + 2]))
    return local, float(np.median(e))


def simulate(dec: np.ndarray, start: int, end: int, n_body: int, extra: int = 0) -> tuple[np.ndarray, list[int]]:
    parts = [dec[:end]]
    seams = []
    pos = end
    for _ in range(n_body - 1):
        seams.append(pos)
        parts.append(dec[start:end])
        pos += end - start
    if extra:
        seams.append(pos)
        parts.append(dec[start:start + extra])
    return np.concatenate(parts), seams


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wav", default=os.path.join(common.WORK, "loop.wav"))
    ap.add_argument("--meta", default=os.path.join(common.WORK, "loop_meta.json"))
    ap.add_argument("--m4a", default=os.path.join(common.BGM_DIR, "local", "reminiscence.m4a"))
    ap.add_argument("--source-info", default=os.path.join(common.WORK, "source_info.json"))
    ap.add_argument("--manifest", default=os.path.join(common.BGM_DIR, "playlist.local.json"))
    ap.add_argument("--report", default=os.path.join(common.WORK, "verify_report.json"))
    ap.add_argument("--no-manifest", action="store_true")
    args = ap.parse_args()

    meta = json.load(open(args.meta))
    src = json.load(open(args.source_info))
    sr = common.SR
    ref, sr_w = sf.read(args.wav, dtype="float32", always_2d=True)
    assert sr_w == sr
    dec = common.decode(args.m4a)
    a, b = meta["loop"]["startSample"], meta["loop"]["endSample"]
    rep: dict = {"file": args.m4a, "fileBytes": os.path.getsize(args.m4a)}

    # ---- decode offset
    refm, decm = ref.mean(axis=1), dec.mean(axis=1)
    n = sr  # 1 s windows
    positions = [int(sr * 2), a + sr, (a + b) // 2, b - 2 * sr, b - n // 2]
    lags = [xcorr_lag(refm, decm, p, n, search=4096) for p in positions]
    lag_vals = [l for l, _ in lags]
    constant = len(set(lag_vals)) == 1
    off = lag_vals[0]
    al = dec[off:off + len(ref)] if off >= 0 else np.vstack([np.zeros((-off, 2), np.float32), dec])[:len(ref)]
    nn = min(len(al), len(ref))
    resid = al[:nn] - ref[:nn]
    snr = 10 * np.log10(np.mean(ref[:nn] ** 2) / (np.mean(resid ** 2) + 1e-20))
    rep["decode"] = {
        "decodedSamples": int(len(dec)), "wavSamples": int(len(ref)), "extraSamplesAtEnd": int(len(dec) - len(ref)),
        "offsets": [{"atSample": p, "lag": l, "ncc": round(c, 5)} for p, (l, c) in zip(positions, lags)],
        "constantShift": constant, "shiftSamples": off, "codecSnrDb": round(float(snr), 2),
    }
    print(f"[decode] decoded {len(dec)} samples vs wav {len(ref)} (+{len(dec) - len(ref)} at end, encoder frame padding)")
    print(f"[decode] lag at positions {positions}: {lag_vals} (NCC {[round(c, 4) for _, c in lags]}) -> "
          f"{'constant' if constant else 'NOT constant'} shift of {off} samples; AAC SNR vs pre-encode {snr:.1f} dB")

    # ---- listening files (simulate the game on the decoded buffer)
    S8 = 8 * sr
    sil = np.zeros((sr, 2), np.float32)
    rep_unit = np.concatenate([dec[b - S8:b], dec[a:a + S8]])
    seam_test = np.concatenate([rep_unit, sil, rep_unit, sil, rep_unit])
    sf.write(os.path.join(common.WORK, "seam_test.wav"), seam_test, sr, subtype="FLOAT")
    full, seams = simulate(dec, a, b, n_body=2, extra=4 * sr)
    fo = sr
    full[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
    sf.write(os.path.join(common.WORK, "full_2loops.wav"), full, sr, subtype="FLOAT")
    print(f"[listen] work/seam_test.wav ({len(seam_test) / sr:.1f} s), work/full_2loops.wav ({len(full) / sr:.1f} s, "
          f"seams at {[round(s / sr, 3) for s in seams]} s)")

    # ---- seam metrics on the simulated stream (first seam) vs natural loopStart in pass 1
    fm = full.mean(axis=1).astype(np.float64)
    centers, rms_db, flux, jump = frame_metrics(fm, sr)
    F = int(meta["crossfade"]["samples"])
    G = int(meta["crossfade"].get("guardSamples", 0))
    act = rms_db > (np.max(rms_db) - 50)

    def window_stats(pos: int) -> dict:
        lo, hi = (pos - F - G - int(0.02 * sr)) / sr, (pos + int(0.02 * sr)) / sr
        sel = (centers >= lo) & (centers <= hi)
        return {"maxFluxDb": round(float(flux[sel].max()), 3), "maxRmsJumpDb": round(float(jump[sel].max()), 3)}

    seam = seams[0]
    natural = a  # in pass 1 the same downbeat at loopStart is reached naturally
    med_flux, p95_flux = float(np.median(flux[act])), float(np.percentile(flux[act], 95))
    med_jump, p95_jump = float(np.median(jump[act])), float(np.percentile(jump[act], 95))
    s_stats, n_stats = window_stats(seam), window_stats(natural)
    # pre-seam only (crossfade region, excludes the downbeat attack that follows the jump)
    def pre_stats(pos: int) -> dict:
        # frames (2048 = 42.7 ms long) must end before the downbeat attack (~preroll after the seam)
        lo, hi = (pos - F - G - int(0.02 * sr)) / sr, (pos - 1024 + int(0.005 * sr)) / sr
        sel = (centers >= lo) & (centers <= hi)
        return {"maxFluxDb": round(float(flux[sel].max()), 3), "maxRmsJumpDb": round(float(jump[sel].max()), 3)}
    s_pre, n_pre = pre_stats(seam), pre_stats(natural)
    click_seam, click_med = hf_click(fm, sr, seam)
    click_nat, _ = hf_click(fm, sr, natural)
    step_seam = float(np.max(np.abs(full[seam] - full[seam - 1])))
    step_med = float(np.median(np.max(np.abs(np.diff(full[seam - sr:seam + sr], axis=0)), axis=1)))
    step_p99 = float(np.percentile(np.max(np.abs(np.diff(full[seam - sr:seam + sr], axis=0)), axis=1), 99))
    rep["seam"] = {
        "trackMedian": {"fluxDb": round(med_flux, 3), "rmsJumpDb": round(med_jump, 3)},
        "trackP95": {"fluxDb": round(p95_flux, 3), "rmsJumpDb": round(p95_jump, 3)},
        "seamWindow": s_stats, "naturalWindowAtLoopStart": n_stats,
        "seamCrossfadeRegionOnly": s_pre, "naturalCrossfadeRegionOnly": n_pre,
        "hfClickDb": {"seam": round(click_seam, 2), "naturalLoopStart": round(click_nat, 2),
                      "median2msWindow": round(click_med, 2)},
        "sampleStepAtJump": round(step_seam, 6), "sampleStepMedian": round(step_med, 6),
        "sampleStepP99": round(step_p99, 6),
        "note": "frames: STFT 2048/256 @48k on mono; window = [seam - guard - xfade - 20 ms, seam + 20 ms]",
    }
    # robustness: what if a browser does not strip the AAC priming (+2112) or strips too much (-1024)?
    rob = {}
    for d in (-1024, 0, 1024, 2112):
        shifted = dec[-d:] if d < 0 else np.vstack([np.zeros((d, 2), np.float32), dec])
        pre_j, post_j = shifted[b - 1], shifted[a]
        steps = np.max(np.abs(np.diff(shifted[b - sr:b], axis=0)), axis=1)
        rob[str(d)] = {"stepAtJump": round(float(np.max(np.abs(post_j - pre_j))), 6),
                       "p99StepBeforeJump": round(float(np.percentile(steps, 99)), 6)}
    rep["seam"]["decoderOffsetRobustness"] = rob
    print("[seam] jump step if decoder offset were d samples: " +
          ", ".join(f"d={k}: {v['stepAtJump']:.4f} (p99 {v['p99StepBeforeJump']:.4f})" for k, v in rob.items()))
    print(f"[seam] spectral flux (mean |d logmag| dB): track median {med_flux:.2f}, p95 {p95_flux:.2f}; "
          f"seam window max {s_stats['maxFluxDb']:.2f} vs natural {n_stats['maxFluxDb']:.2f}; "
          f"crossfade-only {s_pre['maxFluxDb']:.2f} vs natural {n_pre['maxFluxDb']:.2f}")
    print(f"[seam] frame RMS jump dB: track median {med_jump:.2f}, p95 {p95_jump:.2f}; "
          f"seam window max {s_stats['maxRmsJumpDb']:.2f} vs natural {n_stats['maxRmsJumpDb']:.2f}; "
          f"crossfade-only {s_pre['maxRmsJumpDb']:.2f} vs natural {n_pre['maxRmsJumpDb']:.2f}")
    print(f"[seam] HF(>5 kHz) 2 ms energy at jump {click_seam:.1f} dB vs natural {click_nat:.1f} dB "
          f"(median {click_med:.1f} dB); sample step at jump {step_seam:.4f} (median {step_med:.4f}, p99 {step_p99:.4f})")

    # ---- loudness / peak
    lufs_file = common.lufs(dec, sr)
    lufs_body = common.lufs(dec[a:b], sr)
    lufs_2loops = common.lufs(full, sr)
    tp_dec = common.true_peak_dbtp(dec, sr)
    eb = common.ebur128(args.m4a)
    rep["loudness"] = {"lufsFile": round(lufs_file, 2), "lufsBody": round(lufs_body, 2),
                       "lufs2Loops": round(lufs_2loops, 2), "truePeakDbtpDecoded": round(tp_dec, 2),
                       "ffmpegEbur128": eb, "samplePeakDb": round(common.sample_peak_db(dec), 2)}
    print(f"[loudness] integrated: file {lufs_file:.2f} LUFS, body {lufs_body:.2f}, 2-loop sim {lufs_2loops:.2f} "
          f"(ffmpeg ebur128 file: {eb['lufs']} LUFS, LRA {eb['lra']} LU); true peak {tp_dec:.2f} dBTP "
          f"(ffmpeg {eb['truePeakDbtp']})")
    if tp_dec > -1.0:
        print("[loudness] WARNING: decoded true peak above -1 dBTP; rerun render_loop.py with a lower --tp-target")

    common.write_json(args.report, rep)

    if not args.no_manifest:
        gain, clamped = common.gain_for_target(TARGET_LUFS, lufs_body, tp_dec)
        track = {
            "id": "reminiscence",
            "title": "Reminiscence",
            "artist": "Chelsea McGough",
            "file": "local/reminiscence.m4a",
            "sampleRate": sr,
            "lengthSamples": int(meta["lengthSamples"]),
            "durationSec": round(meta["lengthSamples"] / sr, 3),
            "loop": {"startSample": int(a), "endSample": int(b), "crossfadeMs": int(round(meta["loop"]["crossfadeMs"]))},
            "lufs": round(lufs_body, 2),
            "gainDb": gain,
            "truePeakDbtp": round(tp_dec, 2),
            "license": "© Chelsea McGough — personal local use only",
            "source": f"{src['source']} (album Narrow Time)",
            "encoder": f"aac_at cvbr 160k",
            "sourceSha256": src["sourceSha256"],
        }
        if clamped:
            track["gainClamped"] = True
        manifest = {"version": 1, "targetLufs": TARGET_LUFS, "tracks": [track]}
        common.write_json(args.manifest, manifest)
        print(f"[manifest] wrote {args.manifest} (lufs {track['lufs']}, gainDb {gain}{' clamped' if clamped else ''})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
