#!/bin/bash
# 依次（串行，一次只跑一个 Codex）生成 specs.json 里还没有原图的装饰插图。
# 用法：tools/decor/run_all.sh [low|high] [id ...]
#   不传 id 时处理全部，已存在 assets-src/decor/raw/<id>.png 的跳过。
# 遇到额度/用量耗尽（run_codex.sh 退出码 42/43）立即停止，不改用其他后端。
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DECOR="$ROOT/tools/decor"
effort="${1:-low}"; shift || true
if [ $# -gt 0 ]; then ids=("$@"); else ids=($(jq -r '.images[].id' "$DECOR/specs.json")); fi

t0=$(date +%s)
for id in "${ids[@]}"; do
  if [ $# -eq 0 ] && [ -f "$ROOT/assets-src/decor/raw/$id.png" ]; then
    echo "[$id] skip (raw exists)"; continue
  fi
  "$DECOR/run_codex.sh" "$id" "$effort"
  rc=$?
  if [ $rc -eq 42 ] || [ $rc -eq 43 ]; then
    echo "STOPPED at $id (rc=$rc) — quota/usage problem, not falling back." >&2
    exit $rc
  fi
done
echo "ALL DONE in $(( $(date +%s) - t0 ))s"
