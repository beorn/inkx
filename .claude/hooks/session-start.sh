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
if [ -f "$REPO_ROOT/vendor/beorn-tools/tools/recall.ts" ]; then
  # Incremental recall index update (background, silent, best-effort)
  (cd "$REPO_ROOT" && bun vendor/beorn-tools/tools/recall.ts index --incremental) >/dev/null 2>&1 &

  # Daily summarization (background, atomic via lock file)
  LOCK="/tmp/recall-summarize.lock"
  (
    if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT
    cd "$REPO_ROOT" && bun vendor/beorn-tools/tools/recall.ts summarize
  ) >/dev/null 2>&1 &
fi

exit 0
