#!/bin/bash
# 用 Codex CLI 生成一张装饰插图（一次只跑一个任务）。
# 用法：tools/decor/run_codex.sh <id> [low|high]
#   可选环境变量 RETRY_NOTE：重试时写进任务文件的“上次问题”说明（不进入提示词本身）。
# 退出码：0 成功拿到新 PNG；1 失败（非额度）；42 Codex 明确报告额度/用量耗尽；43 无图且回复疑似提到额度，需人工核对。
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DECOR="$ROOT/tools/decor"
id="${1:?usage: run_codex.sh <id> [low|high]}"
effort="${2:-low}"
prompt_file="$DECOR/prompts/$id.txt"
[ -f "$prompt_file" ] || { echo "no prompt file: $prompt_file" >&2; exit 1; }

aspect="$(jq -r --arg id "$id" '.images[] | select(.id==$id) | .aspect' "$DECOR/specs.json")"
label="$(jq -r --arg a "$aspect" '.sizeRequest[$a].label' "$DECOR/specs.json")"
size="$(jq -r --arg a "$aspect" '.sizeRequest[$a].size' "$DECOR/specs.json")"
[ -n "$aspect" ] && [ "$label" != "null" ] || { echo "no spec for $id" >&2; exit 1; }

ts="$(date +%Y%m%d-%H%M%S)"
dir="$ROOT/assets-src/decor/tasks/$id/$effort-$ts"
mkdir -p "$dir" "$ROOT/assets-src/decor/raw"
task="$dir/codex-image-task.txt"

{
  echo "请完成本次图片生成任务，并将真实图片保存为工作目录中的 codex-image.png。"
  echo "下面是已经写好的完整提示词。请把“提示词开始”和“提示词结束”之间的内容原样作为图像生成工具的 prompt，不要改写、翻译、扩写或删减："
  echo "提示词开始"
  cat "$prompt_file"
  echo "提示词结束"
  echo "尺寸：请生成${label}比例的图片；如果图像生成工具支持指定尺寸，请使用 ${size}。不要修改任何默认分辨率设置。最后报告实际尺寸。"
  if [ -n "${RETRY_NOTE:-}" ]; then
    echo "这是重试：上一次的结果有以下问题，请确认本次提交的提示词完整原样：${RETRY_NOTE}"
  fi
  echo "只调用一次图像生成工具。生成的图片会保存在 ~/.codex/generated_images/ 下，从那里复制到工作目录即可；不要为了保存而重新生成，也不要把图片的 base64 数据写进命令。"
  echo "优先使用当前会话已经可用的图像生成能力。"
  echo "如果缺少生图能力、额度用尽或调用失败，请明确报告实际原因，不把文字说明当作图片交付。"
  echo "不要为本任务购买额度、切换到另行付费的 API，或递归调用另一个 Codex CLI。"
  echo "最后报告实际生成文件、尺寸和使用的后端。"
} > "$task"

start=$(date +%s)
codex exec -m gpt-6.1-sol -c model_reasoning_effort="$effort" \
  --skip-git-repo-check --sandbox workspace-write \
  --cd "$dir" --json \
  --output-last-message "$dir/codex-result.md" - \
  < "$task" \
  > "$dir/codex-events.jsonl" \
  2> "$dir/codex-errors.log"
rc=$?
end=$(date +%s)
secs=$((end - start))

turn="none"
grep -q '"type":"turn.completed"' "$dir/codex-events.jsonl" && turn="completed"
grep -q '"type":"turn.failed"' "$dir/codex-events.jsonl" && turn="failed"
errmsgs="$(jq -r 'select(.type=="error" or .type=="turn.failed") | (.message // .error.message // "")' "$dir/codex-events.jsonl" 2>/dev/null | grep -v 'Model metadata' || true)"

img="$dir/codex-image.png"
ok=0; w=""; h=""
if [ -f "$img" ] && [ "$(head -c 8 "$img" | xxd -p)" = "89504e470d0a1a0a" ]; then
  mtime=$(stat -f %m "$img")
  if [ "$mtime" -ge "$start" ]; then
    w=$(sips -g pixelWidth "$img" | awk '/pixelWidth/{print $2}')
    h=$(sips -g pixelHeight "$img" | awk '/pixelHeight/{print $2}')
    [ -n "$w" ] && [ -n "$h" ] && ok=1
  fi
fi

if [ $ok -eq 1 ]; then
  cp "$img" "$ROOT/assets-src/decor/raw/$id.png"
fi

jq -nc --arg id "$id" --arg effort "$effort" --arg dir "${dir#$ROOT/}" --arg turn "$turn" \
  --arg err "$errmsgs" --arg w "$w" --arg h "$h" --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson rc $rc --argjson secs $secs --argjson ok $ok \
  '{id:$id, effort:$effort, model:"gpt-6.1-sol", backend:"codex-cli image_gen", date:$date, dir:$dir, exitCode:$rc, turn:$turn, seconds:$secs, ok:($ok==1), width:($w|tonumber? // null), height:($h|tonumber? // null), error:$err}' \
  >> "$ROOT/assets-src/decor/runs.jsonl"

echo "[$id/$effort] rc=$rc turn=$turn ok=$ok size=${w}x${h} ${secs}s dir=$dir"
[ -n "$errmsgs" ] && echo "[$id/$effort] errors: $errmsgs"

quota_re='usage limit|usage_limit|quota|insufficient_quota|limit reached|exceeded your|out of credits|credits'
if [ $ok -eq 0 ]; then
  if printf '%s\n' "$errmsgs" | grep -qiE "$quota_re" || grep -iE "$quota_re" "$dir/codex-errors.log" | grep -qi 'error'; then
    echo "[$id/$effort] QUOTA/USAGE EXHAUSTION reported — stop." >&2
    exit 42
  fi
  if grep -qiE '额度|用量|quota|usage limit' "$dir/codex-result.md" 2>/dev/null; then
    echo "[$id/$effort] no image and final message mentions quota/usage — check manually." >&2
    exit 43
  fi
  exit 1
fi
exit 0
