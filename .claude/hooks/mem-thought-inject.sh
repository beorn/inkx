#!/bin/bash
# Step 1 of recall ship plan: inject the latest mem-thought hypothesis emit
# as additionalContext on UserPromptSubmit, so the live Claude Code session
# sees what mem-thought *would* have surfaced and we can eyeball usefulness
# in real time instead of offline.
#
# Bead: km-tribe.recall-step1-hypothesis-test
#
# Reads the most recent cycle from ~/.cache/mem-thought-hypothesis.log.
# If the log was written in the last 10 min, injects the cycle's digest.
# Otherwise outputs {} (no injection).
#
# To disable: set SILVERCODE_MEM_HYPOTHESIS_HOOK=0 in env.
set -euo pipefail

LOG="$HOME/.cache/mem-thought-hypothesis.log"
MAX_AGE_S=${MEM_THOUGHT_MAX_AGE_S:-600}

# Disabled?
if [ "${SILVERCODE_MEM_HYPOTHESIS_HOOK:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# Log missing or empty?
if [ ! -f "$LOG" ] || [ ! -s "$LOG" ]; then
  echo '{}'
  exit 0
fi

# File freshness check (macOS / Linux compatible)
NOW=$(date +%s)
if MTIME=$(stat -f %m "$LOG" 2>/dev/null); then :
elif MTIME=$(stat -c %Y "$LOG" 2>/dev/null); then :
else
  echo '{}'
  exit 0
fi
AGE=$((NOW - MTIME))
if [ "$AGE" -gt "$MAX_AGE_S" ]; then
  echo '{}'
  exit 0
fi

# Extract the LAST cycle (everything from the last "=== " marker to EOF).
# Trim leading/trailing whitespace.
LATEST=$(awk '/^=== /{block=""} {block=block $0 ORS} END{print block}' "$LOG" | sed -e 's/[[:space:]]*$//' )

if [ -z "$LATEST" ]; then
  echo '{}'
  exit 0
fi

# Build the additionalContext block. Frame as a hypothesis-test injection
# so the agent knows this is a probe, not a real ambient observation.
CONTEXT="[mem-thought hypothesis test, ${AGE}s ago]
This is the cheapest test of Step 1 in km-tribe.recall — would mem-thought-shaped
emits be useful in real conversations? Treat as observation only; do not act
on it unless you would naturally have wanted this context.

${LATEST}

[end mem-thought hypothesis test]"

# Emit as Claude Code UserPromptSubmit hook output.
jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx
  }
}'
