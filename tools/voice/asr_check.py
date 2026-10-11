"""配音回听检查：用本机 Whisper（离线）转写生成的台词，算字错率（CER）。

由 generate.ts 调用，只能用 Qwen3-TTS 的独立 Python（$TTS_PY）运行，并且一次只跑一个进程：
    $TTS_PY -I tools/voice/asr_check.py <input.json> <output.json> <whisper 模型目录>

input.json:  [{"id": "kumo-01", "audio": "/abs/kumo-01.wav", "ref": "朗读文本"}, ...]
output.json: [{"id", "ref", "hyp", "cer", "refTokens", "seconds"}, ...]

CER 的算法：NFKC + 小写；阿拉伯数字转成汉字；只保留汉字和英文字母；
每个汉字算一个记号，连在一起的英文字母（去掉空格后）算一个记号，
这样英文店名整体算一个词，不会因为字母多而放大权重。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

# 引导 Whisper 输出简体中文（不加时偶尔会出繁体）
INITIAL_PROMPT = "以下是普通话的句子。"
DIGITS = "零一二三四五六七八九"
UNITS = ["", "十", "百", "千"]


def int_to_zh(n: int) -> str:
    if n == 0:
        return DIGITS[0]
    if n >= 10000:
        return "".join(DIGITS[int(d)] for d in str(n))
    out = ""
    s = str(n)
    zero = False
    for i, d in enumerate(s):
        pos = len(s) - 1 - i
        d = int(d)
        if d == 0:
            zero = True
            continue
        if zero and out:
            out += DIGITS[0]
        zero = False
        out += DIGITS[d] + UNITS[pos]
    if out.startswith("一十"):
        out = out[1:]
    return out


def is_cjk(ch: str) -> bool:
    o = ord(ch)
    return 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0xF900 <= o <= 0xFAFF


def tokens(text: str) -> list[str]:
    s = unicodedata.normalize("NFKC", text).lower()
    s = re.sub(r"\d+", lambda m: int_to_zh(int(m.group())), s)
    s = "".join(ch for ch in s if is_cjk(ch) or "a" <= ch <= "z")
    out: list[str] = []
    buf = ""
    for ch in s:
        if "a" <= ch <= "z":
            buf += ch
            continue
        if buf:
            out.append(buf)
            buf = ""
        out.append(ch)
    if buf:
        out.append(buf)
    return out


def edit_distance(a: list[str], b: list[str]) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, y in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y))
        prev = cur
    return prev[-1]


def main() -> None:
    inp, outp, model_path = sys.argv[1:4]
    with open(inp, encoding="utf-8") as f:
        items = json.load(f)

    from mlx_audio.stt.utils import load_model

    t0 = time.perf_counter()
    model = load_model(model_path)
    print(f"whisper loaded in {time.perf_counter() - t0:.1f} s", flush=True)

    results = []
    for it in items:
        t1 = time.perf_counter()
        r = model.generate(it["audio"], language="zh", initial_prompt=INITIAL_PROMPT, verbose=None)
        hyp = (r.text or "").strip()
        ref_t = tokens(it["ref"])
        hyp_t = tokens(hyp)
        cer = edit_distance(ref_t, hyp_t) / max(1, len(ref_t))
        results.append(
            dict(id=it["id"], ref=it["ref"], hyp=hyp, cer=round(cer, 4), refTokens=len(ref_t),
                 seconds=round(time.perf_counter() - t1, 2))
        )
        print(f"{it['id']:<16} CER {cer:.3f}  {hyp}", flush=True)

    with open(outp, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
