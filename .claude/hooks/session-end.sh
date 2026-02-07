#!/bin/bash
# Hook: SessionEnd
# Forks session summarization to background so Claude can exit immediately.
# Stdin contains JSON with transcript_path and session_id.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Must read stdin synchronously (pipe closes when hook exits)
STDIN_DATA=$(cat)

# Fork the actual work to background
if [ -f "$REPO_ROOT/vendor/beorn-tools/tools/recall.ts" ]; then
  TMPFILE=$(mktemp /tmp/recall-remember.XXXXXX)
  echo "$STDIN_DATA" > "$TMPFILE"
  (cd "$REPO_ROOT" && bun vendor/beorn-tools/tools/recall.ts remember < "$TMPFILE" >/dev/null 2>&1; rm -f "$TMPFILE") &
  disown
fi

exit 0
