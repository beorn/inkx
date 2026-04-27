#!/usr/bin/env bash
# Hook-Status: internal
# Detect if the assistant's most recent text block self-injected a role prefix
# (Human:/Assistant:/User:), log the incident, alert the user, and broadcast
# to tribe. Fires on the Stop hook (after each assistant turn ends).
#
# Why: model pattern-completion can emit "Human: <text>" as assistant output,
# especially when context is saturated with role-prefixed system-reminders.
# Once one lands in the session JSONL, past-turn context reinforces the pattern
# (autocatalytic loop). This hook breaks the cycle: surface the incident so the
# user catches it early and the assistant sees a corrective systemMessage.

set -euo pipefail

LOG="${HOME}/.claude/role-prefix-incidents.log"

# Read hook input JSON from stdin (Claude Code passes session metadata here)
INPUT=$(cat || true)

# Extract transcript path (key name varies across CC versions)
SESSION_JSONL=$(jq -r '.transcript_path // .session_transcript // empty' <<<"$INPUT" 2>/dev/null || true)

# Silent no-op when we can't read the transcript
if [ -z "${SESSION_JSONL:-}" ] || [ ! -r "$SESSION_JSONL" ]; then
  exit 0
fi

# Most recent assistant text block (text only; tool_use blocks are not user-visible text)
LAST=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$SESSION_JSONL" 2>/dev/null | tail -n 1 || true)

[ -z "${LAST:-}" ] && exit 0

# Check first 50 chars for role-prefix pattern (case-sensitive; leading whitespace OK)
FIRST50=$(printf '%s' "$LAST" | head -c 50)
if ! printf '%s' "$FIRST50" | grep -qE '^[[:space:]]*(Human|Assistant|User):'; then
  exit 0
fi

# === Incident detected ===
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SID=$(basename "$SESSION_JSONL" .jsonl)
PREVIEW=$(printf '%s' "$LAST" | head -c 500 | tr '\n\r' '  ')

# Append JSONL incident record
mkdir -p "$(dirname "$LOG")"
printf '{"ts":"%s","session":"%s","preview":%s}\n' \
  "$TS" "$SID" "$(jq -Rn --arg s "$PREVIEW" '$s')" >> "$LOG"

# Best-effort tribe broadcast (silent on failure — daemon may not be running)
if command -v bun >/dev/null 2>&1 && [ -d "${CLAUDE_PROJECT_DIR:-.}/vendor/bearly" ]; then
  (cd "${CLAUDE_PROJECT_DIR:-.}" && timeout 3 bun vendor/bearly/tools/tribe-cli.ts send --to='*' \
    --message="⚠️ role-prefix hallucination in session ${SID:0:8} — see ~/.claude/role-prefix-incidents.log" \
    >/dev/null 2>&1) || true
fi

# Emit systemMessage to surface in Claude Code UI
# (Does NOT block continuation — the hallucinated turn is already in the transcript.
# This just alerts the user and nudges the next turn to course-correct.)
cat <<EOF
{
  "systemMessage": "⚠️ Role-prefix hallucination detected: previous response started with 'Human:' / 'Assistant:' / 'User:'. Incident logged to ~/.claude/role-prefix-incidents.log (session ${SID:0:8}). Next turn: do not respond to the phantom content."
}
EOF
