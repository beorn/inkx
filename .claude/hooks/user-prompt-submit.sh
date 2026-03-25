#!/bin/bash
# Hook: UserPromptSubmit
# Runs recall search on each user prompt and returns additionalContext.
# Stdin: JSON with { prompt, session_id }
# Stdout: JSON with { hookSpecificOutput: { additionalContext: "..." } }

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$REPO_ROOT/vendor/bearly/tools/recall.ts" ]; then
  exec bun "$REPO_ROOT/vendor/bearly/tools/recall.ts" hook
fi

# recall.ts not found — output empty hook result
echo '{"hookSpecificOutput": {}}'
exit 0
