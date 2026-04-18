#!/bin/bash
# Hook: SessionEnd
# Forks session summarization to background so Claude can exit immediately.
# Stdin contains JSON with transcript_path and session_id.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Must read stdin synchronously (pipe closes when hook exits)
STDIN_DATA=$(cat)

# Kill ALL vitest fork workers — session is ending, no legitimate workers should remain.
# This is more aggressive than SubagentStop (which spares active workers).
ALL_VITEST=$(ps -eo pid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '{print $1}')
if [ -n "$ALL_VITEST" ]; then
  echo "$ALL_VITEST" | xargs kill -9 2>/dev/null
fi

# Immediately prune this session from tribe (don't wait for 30s heartbeat timeout)
TRIBE_DB="$REPO_ROOT/.beads/tribe.db"
if [ -f "$TRIBE_DB" ] && [ -n "$CLAUDE_SESSION_ID" ]; then
  sqlite3 "$TRIBE_DB" "UPDATE sessions SET pruned_at = $(date +%s)000 WHERE claude_session_id = '$CLAUDE_SESSION_ID'" 2>/dev/null
fi

# Fork the actual work to background
if [ -f "$REPO_ROOT/vendor/bearly/tools/recall.ts" ]; then
  TMPFILE=$(mktemp /tmp/recall-remember.XXXXXX)
  echo "$STDIN_DATA" > "$TMPFILE"
  (cd "$REPO_ROOT" && bun vendor/bearly/tools/recall.ts remember < "$TMPFILE" >/dev/null 2>&1; rm -f "$TMPFILE") &
  disown
fi

# Hook output (required by Claude Code)
echo '{}'
exit 0
