#!/usr/bin/env python3
"""把 assets-src/decor/raw/<id>.png 处理成游戏用的 JPEG，并生成 manifest、prompts.json 和对照图。

用法（在项目根目录）：python3 tools/decor/process.py
只用标准库 + macOS 自带 sips + ffmpeg：
  1. 比例与 specs.json 不符时居中裁切到目标比例；
  2. 长边缩放到 1024（2:3 → 683×1024，3:2 → 1024×683，1:1 → 1024×1024，16:9 → 1024×576）；
  3. 转 sRGB（sips），ffmpeg 编码 JPEG（-q:v 2，按 PSNR 与 sips 质量 85 相当，体积小约 30%）→ public/textures/decor/<id>.jpg；
  4. 写 public/textures/decor/manifest.json、tools/decor/prompts.json；
  5. 用 ffmpeg 拼 assets-src/decor/contact-sheet.jpg。
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECOR = ROOT / "tools" / "decor"
SRC = ROOT / "assets-src" / "decor"
RAW = SRC / "raw"
WORK = SRC / "work"
OUT = ROOT / "public" / "textures" / "decor"
SRGB = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"
TARGET = {"2:3": (683, 1024), "3:2": (1024, 683), "1:1": (1024, 1024), "16:9": (1024, 576)}
FFMPEG_JPEG_QV = 2  # 实测与 sips formatOptions 85 的 PSNR 相当（atlas-books 32.68 vs 32.65 dB），25 张合计约 4.0 MB


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def size_of(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                         check=True, capture_output=True, text=True).stdout
    vals = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("pixelWidth:") or line.startswith("pixelHeight:"):
            k, v = line.split(":")
            vals[k] = int(v)
    return vals["pixelWidth"], vals["pixelHeight"]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_runs():
    runs = []
    p = SRC / "runs.jsonl"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                runs.append(json.loads(line))
    return runs


def prompt_from_task(task_file):
    text = Path(task_file).read_text(encoding="utf-8")
    start = text.index("提示词开始\n") + len("提示词开始\n")
    end = text.index("\n提示词结束")
    return text[start:end]


def main():
    specs = json.loads((DECOR / "specs.json").read_text(encoding="utf-8"))
    runs = load_runs()
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    manifest = {"version": 1, "images": []}
    prompts = {}
    report = []
    missing = []

    for spec in specs["images"]:
        iid, aspect = spec["id"], spec["aspect"]
        raw = RAW / f"{iid}.png"
        if not raw.exists():
            missing.append(iid)
            continue
        raw_hash = sha256(raw)
        id_runs = [r for r in runs if r["id"] == iid]
        selected = None
        for r in id_runs:
            img = ROOT / r["dir"] / "codex-image.png"
            if r.get("ok") and img.exists() and sha256(img) == raw_hash:
                selected = r
        if selected is None:
            print(f"WARN {iid}: raw PNG does not match any recorded Codex run", file=sys.stderr)

        # 1. 居中裁切到目标比例
        rw, rh = size_of(raw)
        aw, ah = (int(x) for x in aspect.split(":"))
        crop = None
        stage = WORK / f"{iid}.crop.png"
        shutil.copyfile(raw, stage)
        if abs(rw * ah - rh * aw) > 0.005 * rw * ah:
            if rw * ah > rh * aw:   # 太宽：裁左右
                cw, ch = round(rh * aw / ah), rh
            else:                   # 太高：裁上下
                cw, ch = rw, round(rw * ah / aw)
            run(["sips", "--cropToHeightWidth", str(ch), str(cw), str(stage)])
            crop = f"{rw}x{rh} -> {cw}x{ch} (centre)"

        # 2. 缩放 3. sRGB + JPEG
        tw, th = TARGET[aspect]
        run(["sips", "-z", str(th), str(tw), str(stage)])
        run(["sips", "--matchTo", SRGB, str(stage)])
        jpg = OUT / f"{iid}.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(stage), "-pix_fmt", "yuvj420p",
             "-q:v", str(FFMPEG_JPEG_QV), str(jpg)])
        fw, fh = size_of(jpg)

        entry = {"id": iid, "file": f"{iid}.jpg", "width": fw, "height": fh, "kind": spec["kind"]}
        if "grid" in spec:
            entry["grid"] = spec["grid"]
        entry["usage"] = spec["usage"]
        if "cells" in spec:
            entry["cells"] = spec["cells"]
        manifest["images"].append(entry)

        attempts = [{"effort": r["effort"], "ok": r["ok"], "seconds": r["seconds"],
                     "dir": r["dir"], "error": r.get("error") or None} for r in id_runs]
        if selected:
            prompts[iid] = {
                "prompt": prompt_from_task(ROOT / selected["dir"] / "codex-image-task.txt"),
                "model": selected["model"],
                "effort": selected["effort"],
                "backend": "Codex CLI (codex exec) built-in image_gen",
                "date": selected["date"],
                "aspect": aspect,
                "sizeRequested": specs["sizeRequest"][aspect]["size"],
                "rawSize": [rw, rh],
                "crop": crop,
                "taskDir": selected["dir"],
                "attempts": attempts,
            }
        report.append({"id": iid, "effort": selected["effort"] if selected else None,
                       "attempts": len(id_runs), "raw": f"{rw}x{rh}", "crop": crop,
                       "final": f"{fw}x{fh}", "bytes": jpg.stat().st_size})

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                       encoding="utf-8")
    (DECOR / "prompts.json").write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + "\n",
                                        encoding="utf-8")

    # 5. 对照图：每张缩放进 300×300 格子，4 列拼接
    sheet_dir = WORK / "sheet"
    # exFAT 上的 ._ AppleDouble 文件会随主文件消失，rmtree 需忽略这类错误
    shutil.rmtree(sheet_dir, ignore_errors=True)
    sheet_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for e in manifest["images"]:
        n += 1
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(OUT / e["file"]), "-vf",
                        "scale=300:300:force_original_aspect_ratio=decrease:flags=lanczos,"
                        "pad=300:300:(ow-iw)/2:(oh-ih)/2:color=0xF4EFE6",
                        str(sheet_dir / f"{n:02d}.png")], check=True)
    if n:
        cols = 4
        rows = (n + cols - 1) // cols
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", str(sheet_dir / "%02d.png"),
                        "-vf", f"tile={cols}x{rows}:padding=10:margin=10:color=0xF4EFE6",
                        "-frames:v", "1", "-q:v", "3", str(SRC / "contact-sheet.jpg")], check=True)

    total = sum(r["bytes"] for r in report)
    for r in report:
        print(json.dumps(r, ensure_ascii=False))
    print(f"total jpg bytes: {total} ({total / 1024 / 1024:.2f} MB), images: {len(report)}")
    if missing:
        print("missing raw: " + ", ".join(missing))


if __name__ == "__main__":
    main()
