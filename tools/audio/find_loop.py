#!/usr/bin/env python3
"""Step 2: find seamless-loop candidates (A = loop start, B = loop end).

Usage:
    python -I tools/audio/find_loop.py [work/bgm_48k.wav] [--phase N] [--top 5] ...

Pipeline
  1. S0  = first real musical onset (1 ms RMS > ref-30 dB) minus a few ms.
  2. Beat tracking (librosa, trim=False). If the beats fit a constant-tempo
     grid (DAW-style production) the fitted grid replaces the tracker's
     frame-quantised beats; the grid is then aligned to the attacks with a
     beat-synchronous 1 ms energy profile.
  3. Bars: 4/4 assumed; downbeat phase = argmax of (low-frequency onset
     strength + chroma novelty) over the 4 possible phases (--phase overrides).
  4. Ending: D = first bar of the terminal monotonic decay (per-bar RMS walking
     back from the end). B must be <= D; B within --guard-bars of D gets a
     small penalty (soft "ideally >= 1 bar earlier").
  5. Beat-synchronous features: CQT chroma, MFCC 1..19, log-RMS, z-scored.
     Phrases: P-bar hypermeter (default 4) whose phase is the bar phase that
     collects the most bar-level novelty peaks (section/phrase boundaries).
     For every (A, B) downbeat pair with A in (S0, S0+45 s] and B-A in the body
     range: similarity = weighted cosine (chroma .5, MFCC .3, RMS .2) of +-8 beat
     windows (pre(A)~pre(B), post(A)~post(B)), minus loudness-difference penalty
     (crossfade region, bar before, bar after), plus bonus for a body that is a
     multiple of 4 / 8 bars, plus bonus when A and B are both phrase starts,
     plus a tiny length tie-breaker.
  6. B refined at sample level by normalised cross-correlation (+-15 ms) over
     the crossfade region; the shift is applied only if the NCC peak >= 0.5
     (otherwise the constant-tempo grid position is kept).
Writes work/candidates.json (top N) with all times in source (48 kHz) samples.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import librosa
import numpy as np
import soundfile as sf
import soxr

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

AN_SR = 22050
HOP = 256


# ----------------------------------------------------------------- helpers
def frame_db(x: np.ndarray, frame: int) -> np.ndarray:
    n = len(x) // frame
    p = np.mean(x[: n * frame].astype(np.float64).reshape(n, frame) ** 2, axis=1)
    return 10 * np.log10(p + 1e-20)


def seg_db(x: np.ndarray, a: int, b: int) -> float:
    a, b = max(0, int(a)), min(len(x), int(b))
    if b <= a:
        return -120.0
    return float(10 * np.log10(np.mean(x[a:b].astype(np.float64) ** 2) + 1e-20))


def zscore_rows(F: np.ndarray, cols: np.ndarray) -> np.ndarray:
    mu = F[:, cols].mean(axis=1, keepdims=True)
    sd = F[:, cols].std(axis=1, keepdims=True) + 1e-9
    return (F - mu) / sd


def cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def ncc_refine(m: np.ndarray, a: int, b: int, pre: int, post: int, search: int) -> tuple[int, float, float]:
    """Best shift d in [-search, search] maximising NCC(m[a-pre:a+post], m[b+d-pre:b+d+post])."""
    ref = m[a - pre: a + post].astype(np.float64)
    ref = ref - ref.mean()
    best_d, best_c, c0 = 0, -2.0, None
    seg = m[b - search - pre: b + search + post].astype(np.float64)
    L = pre + post
    # sliding normalised correlation (small search range -> direct loop is fine with FFT corr)
    corr = np.correlate(seg, ref, mode="valid")  # len = 2*search+1
    csum = np.concatenate([[0.0], np.cumsum(seg)])
    csum2 = np.concatenate([[0.0], np.cumsum(seg ** 2)])
    s1 = csum[L:] - csum[:-L]
    s2 = csum2[L:] - csum2[:-L]
    var = np.maximum(s2 - s1 ** 2 / L, 1e-20)
    ncc = corr / (np.sqrt(var) * np.linalg.norm(ref) + 1e-20)
    for i, c in enumerate(ncc):
        d = i - search
        if d == 0:
            c0 = float(c)
        if c > best_c:
            best_c, best_d = float(c), d
    return best_d, best_c, float(c0 if c0 is not None else 0.0)


# ----------------------------------------------------------------- main
def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav", nargs="?", default=os.path.join(here, "work", "bgm_48k.wav"))
    ap.add_argument("--out", default=os.path.join(here, "work", "candidates.json"))
    ap.add_argument("--phase", type=int, default=None, help="downbeat phase override (0-3, beat index mod 4)")
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--bpm-hint", type=float, default=120.0, help="start_bpm for librosa beat tracker")
    ap.add_argument("--a-window", type=float, default=45.0, help="A must lie within S0 + this many seconds")
    ap.add_argument("--min-body", type=float, default=150.0)
    ap.add_argument("--max-body", type=float, default=185.0)
    ap.add_argument("--fallback-min-body", type=float, default=130.0)
    ap.add_argument("--guard-bars", type=float, default=1.0, help="soft: prefer B >= this many bars before ending D")
    ap.add_argument("--guard-penalty", type=float, default=0.02)
    ap.add_argument("--win-beats", type=int, default=8)
    ap.add_argument("--phrase-bars", type=int, default=4, help="hypermeter length used for the phrase bonus")
    ap.add_argument("--phrase-phase", type=int, default=None, help="override: bar index (mod phrase-bars) of phrase starts")
    ap.add_argument("--phrase-bonus", type=float, default=0.05, help="bonus when A and B are both phrase starts")
    ap.add_argument("--xfade-ms", type=float, default=120.0)
    ap.add_argument("--xfade-guard-ms", type=float, default=50.0,
                    help="crossfade ends this long before B (must match render_loop.py --xfade-guard-ms)")
    ap.add_argument("--preroll-ms", type=float, default=10.0, help="place A/B this far before the downbeat attack")
    ap.add_argument("--start-pre-ms", type=float, default=10.0, help="keep this much before the first onset")
    ap.add_argument("--search-ms", type=float, default=15.0, help="NCC refinement range for B")
    ap.add_argument("--ncc-min", type=float, default=0.5, help="apply the NCC shift only if peak NCC >= this")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--print-rows", type=int, default=15)
    ap.add_argument("--verbose", action="store_true", help="print per-feature-group similarities")
    args = ap.parse_args()

    x, sr = sf.read(args.wav, dtype="float32", always_2d=True)
    assert sr == common.SR, f"expected {common.SR} Hz input"
    mono = x.mean(axis=1)
    dur = len(mono) / sr
    ms = sr // 1000
    F = int(round(args.xfade_ms * sr / 1000))
    G = int(round(args.xfade_guard_ms * sr / 1000))
    bpb = args.beats_per_bar

    # ---- 1. start S0
    db50 = frame_db(mono, sr // 20)
    ref = float(np.percentile(db50[db50 > -90], 95))
    db1 = frame_db(mono, ms)
    onset_frame = int(np.argmax(db1 > ref - 30.0))
    first_onset = onset_frame * ms
    S0 = max(0, first_onset - int(args.start_pre_ms * ms))
    print(f"[start] ref level {ref:.1f} dB, first onset {first_onset / sr * 1000:.1f} ms -> S0 = {S0} ({S0 / sr * 1000:.1f} ms)")

    # ---- 2. beats
    y = soxr.resample(mono, sr, AN_SR, quality="HQ").astype(np.float32)
    oenv = librosa.onset.onset_strength(y=y, sr=AN_SR, hop_length=HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=AN_SR, hop_length=HOP, trim=False,
                                           start_bpm=args.bpm_hint, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    beats = np.asarray(beats, dtype=np.float64)
    ibi_med = float(np.median(np.diff(beats)))
    print(f"[beats] librosa: {len(beats)} beats, tempo {tempo:.2f} BPM, median IBI {ibi_med * 1000:.1f} ms "
          f"(IBI std {np.std(np.diff(beats)) * 1000:.1f} ms)")

    # constant-tempo grid fit (robust to the tracker locking onto off-beats for a while):
    # 1) period T = argmax of the circular concentration of beat times mod T,
    # 2) phase from the circular mean, 3) least-squares refit on the inliers.
    Ts = np.linspace(ibi_med * 0.97, ibi_med * 1.03, 6001)
    R = np.abs(np.exp(2j * np.pi * beats[:, None] / Ts[None, :]).mean(axis=0))
    T = float(Ts[int(np.argmax(R))])
    phi = float(np.angle(np.exp(2j * np.pi * beats / T).mean()) / (2 * np.pi) * T) % T
    k = np.round((beats - phi) / T)
    keep = np.abs(beats - (phi + k * T)) < 0.04
    T, t0 = np.polyfit(k[keep], beats[keep], 1)
    res = beats - (t0 + k * T)
    keep = np.abs(res) < 0.04
    T, t0 = np.polyfit(k[keep], beats[keep], 1)
    res = beats - (t0 + k * T)
    res_med = float(np.median(np.abs(res[keep])))
    frac = float(keep.mean())
    use_grid = res_med < 0.015 and frac > 0.6
    print(f"[grid] fit period {T * 1000:.3f} ms ({60 / T:.3f} BPM), inliers {frac * 100:.0f}% of tracked beats "
          f"(median |residual| {res_med * 1000:.1f} ms; outliers = tracker on off-beats) -> "
          f"{'constant-tempo grid' if use_grid else 'tracked beats (variable tempo)'}")
    if use_grid:
        kmin = int(np.ceil((0 - t0) / T))
        kmax = int(np.floor((dur - t0) / T))
        grid = t0 + T * np.arange(kmin, kmax + 1)
    else:
        grid = beats.copy()
        T = ibi_med

    # attack alignment: beat-synchronous 1 ms log-energy profile, find the steepest rise
    lags = np.arange(-60, 61)  # ms
    env = db1  # 1 ms frames
    gi = np.round(grid * 1000).astype(int)
    valid = (gi + lags[0] >= 1) & (gi + lags[-1] < len(env) - 1) & (grid > first_onset / sr) & (grid < dur - 10)
    prof = np.array([np.mean(np.clip(env[gi[valid] + L], -100, None)) for L in lags])
    rise = np.diff(prof)  # rise[i] = prof[i+1]-prof[i]
    attack_lag_ms = float(lags[int(np.argmax(rise)) + 1])
    grid = grid + attack_lag_ms / 1000.0
    print(f"[grid] attack alignment: downbeat grid shifted by {attack_lag_ms:+.0f} ms (steepest mean energy rise)")

    # ---- 3. features per beat (beat i = [grid_i, grid_{i+1}))
    bf = librosa.time_to_frames(grid, sr=AN_SR, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=AN_SR, hop_length=HOP)
    mel = librosa.feature.melspectrogram(y=y, sr=AN_SR, hop_length=HOP, n_fft=2048, n_mels=64)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(mel), n_mfcc=20)[1:]
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)
    logrms = 20 * np.log10(rms + 1e-6)
    nfr = min(chroma.shape[1], mfcc.shape[1], logrms.shape[1])
    bf = np.clip(bf, 0, nfr - 1)

    def sync(M: np.ndarray) -> np.ndarray:
        out = np.zeros((M.shape[0], len(bf) - 1))
        for i in range(len(bf) - 1):
            a, b = bf[i], max(bf[i + 1], bf[i] + 1)
            out[:, i] = M[:, a:b].mean(axis=1)
        return out

    Cb, Mb, Rb = sync(chroma[:, :nfr]), sync(mfcc[:, :nfr]), sync(logrms[:, :nfr])
    nb = Cb.shape[1]

    # low-frequency onset strength per beat (for downbeat phase)
    Sx = np.abs(librosa.stft(y, n_fft=4096, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=AN_SR, n_fft=4096)
    low = np.log(Sx[freqs < 200].sum(axis=0) + 1e-6)
    low_on = np.concatenate([[0.0], np.maximum(0.0, np.diff(low))])
    low_beat = np.array([low_on[max(0, f - 2): f + 5].max() for f in bf[:nb]])
    # harmonic-change novelty: 1 - cos(chroma of the bar before beat i, chroma of the bar from beat i)
    # (bar-length checkerboard; peaks where chords change, i.e. on downbeats)
    nov = np.zeros(nb)
    for i in range(bpb, nb - bpb):
        nov[i] = 1 - cos(Cb[:, i - bpb:i].sum(axis=1), Cb[:, i:i + bpb].sum(axis=1))

    # ---- 3b. downbeat phase
    bt = grid[:nb]
    active = (bt >= S0 / sr) & (bt < dur)
    z = lambda v: (v - v[active].mean()) / (v[active].std() + 1e-9)  # noqa: E731
    zl, zn = z(low_beat), z(nov)
    phase_scores = []
    for p in range(bpb):
        idx = np.arange(p, nb, bpb)
        idx = idx[active[idx]]
        phase_scores.append(float(np.mean(zl[idx]) + np.mean(zn[idx])))
    phase = int(np.argmax(phase_scores)) if args.phase is None else int(args.phase)
    print(f"[bars] phase scores {np.round(phase_scores, 3).tolist()} -> phase {phase}"
          f"{' (override)' if args.phase is not None else ''}")
    down_idx = np.arange(phase, nb, bpb)
    down_t = grid[down_idx]
    bar_len = T * bpb

    # ---- 4. ending D: first bar of the terminal monotonic decay
    bar_db = np.array([seg_db(mono, t * sr, (t + bar_len) * sr) for t in down_t])
    last = int(np.max(np.nonzero(bar_db > -70)[0]))
    j = last
    while j > 0 and bar_db[j - 1] > bar_db[j] + 0.5:
        j -= 1
    D_t = float(down_t[j])
    print(f"[end] terminal decay starts at bar {j} t={D_t:.3f} s "
          f"(bar dB: {np.round(bar_db[max(0, j - 3): last + 1], 1).tolist()})")

    # ---- 5. candidate pairs
    Z = {"chroma": zscore_rows(Cb, np.nonzero(active)[0]),
         "mfcc": zscore_rows(Mb, np.nonzero(active)[0]),
         "rms": zscore_rows(Rb, np.nonzero(active)[0])}
    gw = {"chroma": 0.5, "mfcc": 0.3, "rms": 0.2}
    W = args.win_beats
    taper = np.linspace(1.0, 0.4, W)
    pre_off, post_off = -np.arange(1, W + 1), np.arange(0, W)

    # phrase (hypermeter) grid: bar-level novelty, period P bars, phase = argmax mean novelty
    P = args.phrase_bars
    Fz = np.vstack([Z["chroma"], Z["mfcc"], Z["rms"]])
    barF = np.stack([Fz[:, i:i + bpb].mean(axis=1) for i in down_idx[:-1] if i + bpb <= nb], axis=1)
    nbar = barF.shape[1]
    nov_bar = np.zeros(nbar)
    for jb in range(P, nbar - P):  # P-bar checkerboard: emphasises phrase/section boundaries
        nov_bar[jb] = 1 - cos(barF[:, jb - P:jb].mean(axis=1), barF[:, jb:jb + P].mean(axis=1))
    bar_active = (down_t[:nbar] >= S0 / sr) & (down_t[:nbar] <= D_t + 1e-6)
    # novelty peaks (local maxima within +-2 bars) mark phrase/section boundaries; the phrase
    # phase is the bar phase (mod P) collecting the most peak novelty.
    peaks = [jb for jb in range(P, nbar - P) if bar_active[jb]
             and nov_bar[jb] >= nov_bar[max(0, jb - 2):jb + 3].max() - 1e-12]
    phrase_scores = [float(sum(nov_bar[jb] for jb in peaks if jb % P == q)) for q in range(P)]
    if os.environ.get("FIND_LOOP_DEBUG"):
        top = np.argsort(nov_bar)[::-1][:16]
        print("[debug] top bar novelty:", [(int(b), round(float(down_t[b]), 2), round(float(nov_bar[b]), 3)) for b in top])
    phrase_phase = int(np.argmax(phrase_scores)) if args.phrase_phase is None else int(args.phrase_phase)
    bar_of = {int(i): jb for jb, i in enumerate(down_idx)}
    print(f"[phrase] {P}-bar phrase novelty by bar phase {np.round(phrase_scores, 3).tolist()} -> phrases start at "
          f"bar phase {phrase_phase} (t = {down_t[phrase_phase]:.3f} + k*{P * bar_len:.3f} s)")

    def window_sim(ia: int, ib: int, offs: np.ndarray) -> dict:
        out = {}
        for g, M in Z.items():
            va = (M[:, ia + offs] * taper).ravel()
            vb = (M[:, ib + offs] * taper).ravel()
            out[g] = cos(va, vb)
        out["all"] = sum(gw[g] * out[g] for g in gw)
        return out

    pre_s = args.preroll_ms / 1000.0
    S0_t = S0 / sr
    A_list = [i for i in down_idx if S0_t + (F + G) / sr + 0.05 < grid[i] - pre_s <= S0_t + args.a_window
              and i - W >= 0]
    B_list = [i for i in down_idx if grid[i] <= D_t + 1e-6 and i + W < nb]

    def collect(min_body: float) -> list[dict]:
        cands = []
        for ia in A_list:
            for ib in B_list:
                body = grid[ib] - grid[ia]
                if not (min_body <= body <= args.max_body):
                    continue
                pre = window_sim(ia, ib, pre_off)
                post = window_sim(ia, ib, post_off)
                sim = 0.5 * pre["all"] + 0.5 * post["all"]
                A = int(round((grid[ia] - pre_s) * sr))
                B = int(round((grid[ib] - pre_s) * sr))
                bar_n = int(round(bar_len * sr))
                dl_xf = abs(seg_db(mono, A - F - G, A - G) - seg_db(mono, B - F - G, B - G))
                dl_pre = abs(seg_db(mono, A - bar_n, A) - seg_db(mono, B - bar_n, B))
                dl_post = abs(seg_db(mono, A, A + bar_n) - seg_db(mono, B, B + bar_n))
                pen = 0.008 * dl_xf + 0.01 * 0.5 * (dl_pre + dl_post)
                bars = int(round((ib - ia) / bpb))
                bonus = (0.05 if bars % 4 == 0 else 0.0) + (0.02 if bars % 8 == 0 else 0.0)
                ja, jb_ = bar_of[int(ia)], bar_of[int(ib)]
                at_phrase = (ja - phrase_phase) % P == 0 and (jb_ - phrase_phase) % P == 0
                bonus += args.phrase_bonus if at_phrase else 0.0
                bars_before_end = (D_t - grid[ib]) / bar_len
                guard = args.guard_penalty if bars_before_end < args.guard_bars - 1e-6 else 0.0
                lenb = 0.0003 * body
                score = sim - pen + bonus - guard + lenb
                cands.append(dict(ia=int(ia), ib=int(ib), A=A, B=B, body=body, bars=bars, sim=sim,
                                  pre=pre, post=post, dl_xf=dl_xf, dl_pre=dl_pre, dl_post=dl_post,
                                  penalty=pen, bonus=bonus, guard=guard, lenBonus=lenb, score=score,
                                  phraseStart=bool(at_phrase),
                                  barsBeforeEnding=bars_before_end))
        return cands

    cands = collect(args.min_body)
    body_rule = f">= {args.min_body:.0f} s"
    if not cands:
        print(f"[cand] no candidates with body >= {args.min_body} s; falling back to {args.fallback_min_body} s")
        cands = collect(args.fallback_min_body)
        body_rule = f">= {args.fallback_min_body:.0f} s (fallback)"
    if not cands:
        raise SystemExit("no loop candidates found")
    cands.sort(key=lambda c: -c["score"])

    print(f"\n[cand] {len(cands)} pairs (A in {len(A_list)} downbeats, B in {len(B_list)} downbeats, body {body_rule})")
    print(" rank    A(s)     B(s)   body(s) bars  sim   pre   post  dLxf  pen   bonus guard score  phrase")
    for r, c in enumerate(cands[: args.print_rows]):
        print(f" {r:3d} {grid[c['ia']]:8.3f} {grid[c['ib']]:8.3f} {c['body']:8.3f} {c['bars']:4d} "
              f"{c['sim']:.3f} {c['pre']['all']:.3f} {c['post']['all']:.3f} {c['dl_xf']:5.1f} "
              f"{c['penalty']:.3f} {c['bonus']:.3f} {c['guard']:.3f} {c['score']:.3f}  {'yes' if c['phraseStart'] else ' - '}"
              + (f"   pre c/m/r {c['pre']['chroma']:.2f}/{c['pre']['mfcc']:.2f}/{c['pre']['rms']:.2f}"
                 f" post c/m/r {c['post']['chroma']:.2f}/{c['post']['mfcc']:.2f}/{c['post']['rms']:.2f}"
                 if args.verbose else ""))

    # ---- 6. sample-level refinement of B for the top N
    S = int(round(args.search_ms * ms))
    out_c = []
    for r, c in enumerate(cands[: args.top]):
        d, c_best, c0 = ncc_refine(mono, c["A"], c["B"], pre=F + G + 20 * ms, post=20 * ms, search=S)
        if c_best < args.ncc_min:
            # no meaningful waveform match within +-search: a random NCC peak would only add
            # timing jitter, so keep the (sample-accurate) constant-tempo grid position.
            d, c_best = 0, c0
        c["B_refined"] = c["B"] + d
        c["nccShift"] = d
        c["ncc"] = c_best
        c["ncc0"] = c0
        out_c.append({
            "rank": r,
            "A": {"sample": c["A"], "sec": round(c["A"] / sr, 6), "beat": c["ia"]},
            "B": {"sample": c["B_refined"], "sec": round(c["B_refined"] / sr, 6), "beat": c["ib"],
                  "gridSample": c["B"], "nccShiftSamples": d},
            "bodySec": round((c["B_refined"] - c["A"]) / sr, 6),
            "bodyBars": c["bars"],
            "score": round(c["score"], 4),
            "similarity": round(c["sim"], 4),
            "pre": {k: round(v, 4) for k, v in c["pre"].items()},
            "post": {k: round(v, 4) for k, v in c["post"].items()},
            "loudnessDiffDb": {"xfadeRegion": round(c["dl_xf"], 2), "barBefore": round(c["dl_pre"], 2),
                               "barAfter": round(c["dl_post"], 2)},
            "penalty": round(c["penalty"], 4), "barBonus": round(c["bonus"], 4), "guardPenalty": c["guard"],
            "atPhraseStarts": c["phraseStart"],
            "lengthBonus": round(c["lenBonus"], 4),
            "barsBeforeEnding": round(c["barsBeforeEnding"], 3),
            "ncc": round(c["ncc"], 4), "nccAtGrid": round(c["ncc0"], 4),
        })
        print(f"[refine] rank {r}: B shift {d:+d} samples ({d / sr * 1000:+.2f} ms), NCC {c0:.3f} -> {c_best:.3f}")

    result = {
        "input": os.path.abspath(args.wav),
        "sampleRate": sr,
        "lengthSamples": len(mono),
        "S0": {"sample": S0, "sec": round(S0 / sr, 6), "firstOnsetSample": first_onset},
        "endingStart": {"sec": round(D_t, 4), "sample": int(round(D_t * sr))},
        "tempo": {"librosaBpm": round(tempo, 3), "gridBpm": round(60 / T, 4), "beatPeriodSec": round(T, 6),
                  "constantTempoGrid": bool(use_grid), "gridResidualMedianMs": round(res_med * 1000, 2),
                  "attackAlignMs": attack_lag_ms},
        "phrases": {"bars": P, "phase": phrase_phase, "scores": [round(v, 4) for v in phrase_scores],
                    "firstPhraseStartsSec": [round(float(down_t[phrase_phase + P * q]), 4) for q in range(4)]},
        "bars": {"beatsPerBar": bpb, "phase": phase, "phaseScores": [round(s, 4) for s in phase_scores],
                 "phaseOverride": args.phase is not None, "barSec": round(bar_len, 6),
                 "firstDownbeatsSec": [round(float(t), 4) for t in down_t[:6]]},
        "params": {k: v for k, v in vars(args).items() if k not in ("wav", "out")},
        "bodyRule": body_rule,
        "nPairs": len(cands),
        "candidates": out_c,
    }
    common.write_json(args.out, result)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
