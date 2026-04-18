#!/bin/bash
# Hook: UserPromptSubmit
# 1. On /compact: run pre-compact checkpoint, inject context into additionalContext
# 2. Otherwise: run recall search for session memory
#
# Stdin: JSON with { prompt, session_id }
# Stdout: JSON with { hookSpecificOutput: { additionalContext: "..." } }

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Peek at stdin to check for /compact (tee so we can re-pipe)
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

# Intercept /compact — run pre-compact checkpoint and inject context
if echo "$PROMPT" | grep -qiE '^\s*/compact'; then
  CONTEXT=$("$REPO_ROOT/.claude/hooks/pre-compact.sh" 2>/dev/null)
  if [ -n "$CONTEXT" ]; then
    # Escape for JSON and output as additionalContext
    ESCAPED=$(echo "$CONTEXT" | jq -Rs .)
    echo "{\"hookSpecificOutput\": {\"hookEventName\": \"UserPromptSubmit\", \"additionalContext\": $ESCAPED}}"
    exit 0
  fi
fi

# Default: run recall hook
if [ -f "$REPO_ROOT/vendor/bearly/tools/recall.ts" ]; then
  echo "$INPUT" | exec bun "$REPO_ROOT/vendor/bearly/tools/recall.ts" hook
else
  echo '{}'
  exit 0
fi
