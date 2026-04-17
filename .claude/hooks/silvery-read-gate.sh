#!/bin/bash
# PreToolUse gate: block Edit/Write/NotebookEdit in silvery-touching paths
# until the-silvery-way.md is read in the current session.
#
# Enforcement for the Silvery Resolver (.claude/skills/tui/silvery-resolver.md).
# See: docs/lessons/refactoring.md + feedback-check-before-claiming-limits.md

set -uo pipefail

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""')
file=$(echo "$input" | jq -r '.tool_input.file_path // ""')
session=$(echo "$input" | jq -r '.session_id // "unknown"')

# Only gate mutation tools.
case "$tool" in
  Edit|Write|NotebookEdit|MultiEdit) ;;
  *) exit 0 ;;
esac

# Only gate silvery-touching paths: km-tui views/state + silvery package source.
case "$file" in
  */apps/km-tui/src/views/*|*/apps/km-tui/src/state/omnibox*|*/vendor/silvery/packages/*) ;;
  *) exit 0 ;;
esac

marker="/tmp/claude-silvery-read-${session}"
if [ -f "$marker" ]; then
  exit 0
fi

# Block with a directive the model can follow.
cat >&2 <<'EOF'
SILVERY RESOLVER GATE — blocked.

Before editing this file you MUST Read the silvery primer in this session:

  Read vendor/silvery/docs/guide/the-silvery-way.md

The primer reprograms you out of generic terminal-UI assumptions
(ANSI-flat, closed presets, etc.) into silvery's actual model
(semantic tokens, cascading inheritance, prop-spread override, etc.).

Routing: .claude/skills/tui/silvery-resolver.md — walk the decision
tree to find the OTHER silvery docs you need for this specific edit
(styling.md, typography.tsx JSDoc, component audit gate).

Once the-silvery-way.md has been Read this session, this gate unlocks
automatically and you can proceed with the edit.
EOF

# exit 2 == block the tool call and surface stderr to the model
exit 2
