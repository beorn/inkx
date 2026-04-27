#!/bin/bash
# Hook: SessionStart
# 1. Export CLAUDE_SESSION_ID for /bd claiming functionality
# 2. Trigger incremental recall index update (background)
# 3. Summarize any unprocessed past days (background, atomic via lock file)

SESSION_ID=$(cat | jq -r '.session_id // empty')
if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$SESSION_ID" ]; then
  SHORT_ID="${SESSION_ID:0:8}"
  echo "export CLAUDE_SESSION_ID='${SESSION_ID}'" >> "$CLAUDE_ENV_FILE"
  echo "export BD_ACTOR='claude:${SHORT_ID}'" >> "$CLAUDE_ENV_FILE"
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="/tmp/recall-session-start.log"

if [ -f "$REPO_ROOT/vendor/bearly/tools/recall.ts" ]; then
  DB="$HOME/.claude/session-index.db"
  SKIP_INDEX=0

  # Skip incremental index if DB was modified within the last hour (saves ~50s CPU)
  if [ -f "$DB" ] && find "$DB" -mmin -60 -print -quit 2>/dev/null | grep -q .; then
    SKIP_INDEX=1
    echo "$(date '+%H:%M:%S') index skipped (<1h old)" >> "$LOG"
  fi

  if [ "$SKIP_INDEX" -eq 0 ]; then
    (cd "$REPO_ROOT" && bun vendor/bearly/tools/recall.ts index --incremental 2>&1 | tail -5 >> "$LOG") </dev/null &>/dev/null &
    disown
  fi

  # Daily summarization (background, atomic via lock file, skip if <1h old)
  STAMP="/tmp/recall-summarize-last"
  LOCK="/tmp/recall-summarize.lock"
  SKIP_SUMMARIZE=0
  if [ -f "$STAMP" ] && find "$STAMP" -mmin -60 -print -quit 2>/dev/null | grep -q .; then
    SKIP_SUMMARIZE=1
    echo "$(date '+%H:%M:%S') summarize skipped (<1h old)" >> "$LOG"
  fi

  if [ "$SKIP_SUMMARIZE" -eq 0 ]; then
    (
      if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
      trap 'rmdir "$LOCK" 2>/dev/null' EXIT
      cd "$REPO_ROOT" && bun vendor/bearly/tools/recall.ts summarize 2>&1 | tail -5 >> "$LOG"
      touch "$STAMP"
    ) </dev/null &>/dev/null &
    disown
  fi
fi

# Cadence reminders — surface stale test suites and stale /sop domains
# at most once per day each. Cheap checks; emit hookSpecificOutput.additionalContext.
CADENCE=""
if [ -x "$REPO_ROOT/packages/km-infra/scripts/test-cadence-check.sh" ]; then
  CADENCE=$(bash "$REPO_ROOT/packages/km-infra/scripts/test-cadence-check.sh" 2>/dev/null || true)
fi

SOP_CADENCE=""
if [ -x "$REPO_ROOT/packages/km-infra/scripts/sop-cadence-check.sh" ]; then
  SOP_CADENCE=$(bash "$REPO_ROOT/packages/km-infra/scripts/sop-cadence-check.sh" 2>/dev/null || true)
fi

# Combine reminders with a blank-line separator if both fired.
COMBINED=""
if [ -n "$CADENCE" ] && [ -n "$SOP_CADENCE" ]; then
  COMBINED="$CADENCE"$'\n\n'"$SOP_CADENCE"
elif [ -n "$CADENCE" ]; then
  COMBINED="$CADENCE"
elif [ -n "$SOP_CADENCE" ]; then
  COMBINED="$SOP_CADENCE"
fi

if [ -n "$COMBINED" ]; then
  jq -n --arg msg "$COMBINED" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $msg}}'
else
  echo '{}'
fi
exit 0
