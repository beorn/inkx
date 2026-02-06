#!/bin/bash
# Hook: SessionStart
# 1. Export CLAUDE_SESSION_ID for /bd claiming functionality
# 2. Trigger incremental recall index update (background)

SESSION_ID=$(cat | jq -r '.session_id // empty')
if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$SESSION_ID" ]; then
  SHORT_ID="${SESSION_ID:0:8}"
  echo "export CLAUDE_SESSION_ID='${SESSION_ID}'" >> "$CLAUDE_ENV_FILE"
  echo "export BD_ACTOR='claude:${SHORT_ID}'" >> "$CLAUDE_ENV_FILE"
fi

# Incremental recall index update (background, silent, best-effort)
# Keeps FTS5 index fresh so `bun recall` finds recent sessions
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$REPO_ROOT/vendor/beorn-tools/tools/recall.ts" ]; then
  (cd "$REPO_ROOT" && bun vendor/beorn-tools/tools/recall.ts index --incremental) >/dev/null 2>&1 &
fi

exit 0
