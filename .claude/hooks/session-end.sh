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

# Note: previously this hook wrote `pruned_at = now()` to `.beads/tribe.db`,
# but the DB moved to `~/.local/share/tribe/tribe.db` (user-global since
# 2026-04-18) AND the schema has NO `pruned_at` column. The hook was
# silently failing. Intentionally removed — dead rows are handled via
# F1-B (tribe.rename reclaims dead names on liveness check) and F1-D
# (auto-adopt non-auto-named dead session at same cwd+role on join).
# See beads km-bearly.tribe-session-resume + km-bearly.tribe-claude-rename-sync.

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
