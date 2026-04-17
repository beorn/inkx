#!/bin/bash
# PostToolUse marker: when vendor/silvery/docs/guide/the-silvery-way.md is Read,
# touch a session-scoped marker file so silvery-read-gate.sh unlocks.

set -uo pipefail

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""')
file=$(echo "$input" | jq -r '.tool_input.file_path // ""')
session=$(echo "$input" | jq -r '.session_id // "unknown"')

if [ "$tool" != "Read" ]; then exit 0; fi

# Accept any Read of the-silvery-way.md (the canonical primer).
case "$file" in
  */vendor/silvery/docs/guide/the-silvery-way.md)
    touch "/tmp/claude-silvery-read-${session}"
    ;;
esac

exit 0
