#!/usr/bin/env bash
# Emit a SessionStart additionalContext reminder when long-running test
# suites haven't run locally in a while. Stamps are written by
# test-cadence-stamp.sh after a successful run.
#
# Cadence:
#   test:fuzz  → daily   (24h)
#   test:ci    → weekly  (168h)
#
# Output: prints the reminder text on stdout (caller embeds into hook JSON),
# or nothing if all suites are fresh OR we already prompted today.
#
# Daily-prompt dedup via $dir/prompted-today (date-stamped).

set -e

dir="${XDG_STATE_HOME:-$HOME/.local/state}/km-cadence"
mkdir -p "$dir"

today=$(date +%Y-%m-%d)
prompt_stamp="$dir/prompted-$today"

# Already prompted today — stay quiet.
[ -f "$prompt_stamp" ] && exit 0

# age_hours <stamp-file> → integer hours since mtime, or 99999 if missing
age_hours() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo 99999
    return
  fi
  local now mtime
  now=$(date +%s)
  mtime=$(stat -f %m "$f" 2>/dev/null) || mtime=$(stat -c %Y "$f" 2>/dev/null)
  echo $(( (now - mtime) / 3600 ))
}

human_age() {
  local h="$1"
  if [ "$h" -ge 99999 ]; then
    echo "never"
  elif [ "$h" -ge 48 ]; then
    echo "$((h / 24)) days ago"
  elif [ "$h" -ge 1 ]; then
    echo "${h}h ago"
  else
    echo "<1h ago"
  fi
}

fuzz_age=$(age_hours "$dir/last-fuzz")
ci_age=$(age_hours "$dir/last-ci")

lines=()
[ "$fuzz_age" -ge 24 ]  && lines+=("- test:fuzz last passed $(human_age "$fuzz_age") (target: daily) → \`bun run test:fuzz\` (~30s)")
[ "$ci_age"   -ge 168 ] && lines+=("- test:ci last passed $(human_age "$ci_age") (target: weekly) → \`bun run test:ci\` (~3-5 min)")

[ "${#lines[@]}" -eq 0 ] && exit 0

# Emit and dedup-mark.
echo "Test cadence reminder (mention to user, don't run automatically):"
printf '%s\n' "${lines[@]}"
touch "$prompt_stamp"

# Garbage-collect old prompt stamps (keep dir tidy).
find "$dir" -name 'prompted-*' -mtime +30 -delete 2>/dev/null || true
