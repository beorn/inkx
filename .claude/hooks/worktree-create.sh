#!/bin/bash
# Hook: WorktreeCreate
# Runs when Claude Code creates a temporary agent worktree (isolation: "worktree").
# Sets up submodules, dependencies, and direnv in the new worktree.
#
# IMPORTANT — this hook fires BEFORE `git worktree add` finishes writing the
# directory to disk. We spawn a detached background setup process and exit
# immediately so Claude Code doesn't stall waiting for us.
#
# Claude Code sends JSON via stdin with fields:
#   session_id, transcript_path, cwd, hook_event_name, name
# `name` is the worktree dir name (e.g. "agent-a1b2c3d4").
# Full path: $CLAUDE_PROJECT_DIR/.claude/worktrees/<name>.

LOG="/tmp/worktree-create-hook.log"
INPUT=$(cat)
echo "$(date '+%H:%M:%S') INPUT: $INPUT" >> "$LOG"

NAME=$(echo "$INPUT" | jq -r '.name // empty')
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
fi

if [ -z "$NAME" ]; then
  echo "$(date '+%H:%M:%S') No name field in JSON — exiting silently" >> "$LOG"
  echo '{"continue": true}'
  exit 0
fi

WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$NAME"
echo "$(date '+%H:%M:%S') Scheduling background setup: $WORKTREE_PATH" >> "$LOG"

# Detach setup to background so the hook returns immediately.
# Claude Code's hook timeout doesn't wait for this.
(
  # Poll for the worktree to exist — can take 10-30s for git worktree add to finish
  for i in $(seq 1 60); do
    if [ -d "$WORKTREE_PATH/.git" ] || [ -f "$WORKTREE_PATH/.git" ]; then break; fi
    sleep 1
  done

  if ! cd "$WORKTREE_PATH" 2>/dev/null; then
    echo "$(date '+%H:%M:%S') [$NAME] worktree never appeared — giving up" >> "$LOG"
    exit 0
  fi

  echo "$(date '+%H:%M:%S') [$NAME] setting up: $WORKTREE_PATH" >> "$LOG"

  # Initialize submodules
  if [ -f .gitmodules ]; then
    git submodule update --init --recursive 2>&1 | tail -3 >> "$LOG"
  fi

  # Install dependencies
  if [ -f bun.lock ] || [ -f bun.lockb ]; then
    bun install --frozen-lockfile 2>&1 | tail -3 >> "$LOG"
  elif [ -f package-lock.json ]; then
    npm ci 2>&1 | tail -3 >> "$LOG"
  fi

  # Allow direnv
  if [ -f .envrc ] && command -v direnv &>/dev/null; then
    direnv allow 2>&1 >> "$LOG"
  fi

  echo "$(date '+%H:%M:%S') [$NAME] setup complete" >> "$LOG"
) </dev/null >/dev/null 2>&1 &
disown

# Tell Claude Code we succeeded (non-blocking)
echo '{"continue": true}'
exit 0
