#!/usr/bin/env bash
# Emit a SessionStart additionalContext reminder when /sop domains haven't
# been run within their cadence window. State stamps are written by
# `bun tools/sop.ts scan` (state.lastRun.<domain>).
#
# Cadence (from .claude/skills/sop/SKILL.md):
#   security, inbound, backlog → weekly  (7 days)
#   packages, infra, market, growth → monthly (30 days)
#   legal → quarterly (90 days)
#   code, sites, packaging → event-driven (skipped)
#
# Output: prints the reminder text on stdout (caller embeds into hook JSON),
# or nothing if all domains are fresh OR we already prompted today.
#
# Daily-prompt dedup via $dir/sop-prompted-today (date-stamped).
# Reuses the km-cadence dir so test-cadence and sop-cadence share GC.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE_FILE="$REPO_ROOT/.claude/skills/sop/state.json"

dir="${XDG_STATE_HOME:-$HOME/.local/state}/km-cadence"
mkdir -p "$dir"

today=$(date +%Y-%m-%d)
prompt_stamp="$dir/sop-prompted-$today"

# Already prompted today — stay quiet.
[ -f "$prompt_stamp" ] && exit 0

# No state file yet → nothing to remind about; SOP hasn't been initialized.
[ -f "$STATE_FILE" ] || exit 0

# age_days <iso-timestamp> → integer days since timestamp, or 99999 if empty/null
age_days() {
  local iso="$1"
  if [ -z "$iso" ] || [ "$iso" = "null" ]; then
    echo 99999
    return
  fi
  local now then
  now=$(date +%s)
  # macOS date -j -f vs GNU date -d
  then=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${iso%.*}" +%s 2>/dev/null) \
    || then=$(date -d "$iso" +%s 2>/dev/null) \
    || { echo 99999; return; }
  echo $(( (now - then) / 86400 ))
}

human_age() {
  local d="$1"
  if [ "$d" -ge 99999 ]; then
    echo "never"
  elif [ "$d" -ge 1 ]; then
    echo "${d}d ago"
  else
    echo "<1d ago"
  fi
}

read_last() {
  jq -r ".lastRun.\"$1\" // \"\"" "$STATE_FILE" 2>/dev/null
}

# Weekly domains (>7d stale)
declare -a weekly=("security" "inbound" "backlog")
# Monthly domains (>30d stale)
declare -a monthly=("packages" "infra")
# Quarterly domains (>90d stale)
declare -a quarterly=("legal")

lines=()

for d in "${weekly[@]}"; do
  age=$(age_days "$(read_last "$d")")
  [ "$age" -ge 8 ] && lines+=("- /sop $d last ran $(human_age "$age") (target: weekly) → \`/sop $d\`")
done

for d in "${monthly[@]}"; do
  age=$(age_days "$(read_last "$d")")
  [ "$age" -ge 31 ] && lines+=("- /sop $d last ran $(human_age "$age") (target: monthly) → \`/sop $d\`")
done

for d in "${quarterly[@]}"; do
  age=$(age_days "$(read_last "$d")")
  [ "$age" -ge 91 ] && lines+=("- /sop $d last ran $(human_age "$age") (target: quarterly) → \`/sop $d\`")
done

[ "${#lines[@]}" -eq 0 ] && exit 0

echo "SOP cadence reminder (mention to user, don't run automatically):"
printf '%s\n' "${lines[@]}"
touch "$prompt_stamp"

# Garbage-collect old prompt stamps.
find "$dir" -name 'sop-prompted-*' -mtime +30 -delete 2>/dev/null || true

exit 0
