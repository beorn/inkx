#!/bin/bash
# Hook: WorktreeCreate
# Fires when Claude Code spawns an Agent with isolation: "worktree".
# Claude Code passes the intended worktree name via JSON stdin; this hook
# is responsible for creating the clone directory at
#   $PROJECT_DIR/.claude/worktrees/$NAME
# before the Agent starts working in it.
#
# Mechanism: APFS copy-on-write via .claude/lib/isolate.sh
#
# The original design polled for a directory that git-worktree-add would
# populate — but Claude Code's Agent runtime never invokes git worktree,
# so the poll timed out after 60s and the Agent wrote to main instead.
# The 2026-04-23 rewrite has the hook CREATE the clone directly.
#
# Timing on the km repo: ~20-25s for the cp -c -R. Hook blocks until done
# so the Agent starts on a ready directory. Setup work that isn't
# correctness-critical (direnv allow) is backgrounded after return.
#
# See bead km-infra.worktree-isolation-apfs for the full design.

LOG="/tmp/worktree-create-hook.log"
LIB_DIR="$(dirname "$0")/../lib"
INPUT=$(cat)
echo "$(date '+%H:%M:%S') INPUT: $INPUT" >> "$LOG"

NAME=$(echo "$INPUT" | jq -r '.name // empty')
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
fi

if [ -z "$NAME" ]; then
  echo "$(date '+%H:%M:%S') No name field — exiting" >> "$LOG"
  echo '{"continue": true}'
  exit 0
fi

WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$NAME"
echo "$(date '+%H:%M:%S') [$NAME] creating clone at $WORKTREE_PATH" >> "$LOG"

# Source isolate.sh and run the clone SYNCHRONOUSLY.
# Agent starts as soon as we return — target must be ready.
# shellcheck source=../lib/isolate.sh
if ! source "$LIB_DIR/isolate.sh"; then
  echo "$(date '+%H:%M:%S') [$NAME] FAILED to source isolate.sh" >> "$LOG"
  echo '{"continue": false, "stopReason": "isolate.sh not found"}'
  exit 1
fi

START=$(date +%s)
if ! isolate_worktree "$PROJECT_DIR" "$WORKTREE_PATH" 2>>"$LOG"; then
  echo "$(date '+%H:%M:%S') [$NAME] isolate_worktree FAILED" >> "$LOG"
  echo '{"continue": false, "stopReason": "worktree isolation failed"}'
  exit 1
fi
ELAPSED=$(( $(date +%s) - START ))
echo "$(date '+%H:%M:%S') [$NAME] clone complete (${ELAPSED}s)" >> "$LOG"

# Background the non-critical setup (direnv, etc).
# node_modules is already correct via CoW; no bun install needed.
# Submodule .git paths are correct via isolate.sh fixups; no submodule update needed.
(
  cd "$WORKTREE_PATH" 2>/dev/null || exit 0
  if [ -f .envrc ] && command -v direnv &>/dev/null; then
    direnv allow 2>&1 >> "$LOG"
  fi
  echo "$(date '+%H:%M:%S') [$NAME] bg setup done" >> "$LOG"
) </dev/null >/dev/null 2>&1 &
disown

echo '{"continue": true}'
exit 0
