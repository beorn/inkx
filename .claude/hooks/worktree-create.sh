#!/bin/bash
# Hook: WorktreeCreate
# Runs when Claude Code creates a temporary agent worktree (isolation: "worktree").
# Sets up submodules, dependencies, and direnv in the new worktree.
#
# Claude Code sends JSON via stdin with fields:
#   session_id, transcript_path, cwd, hook_event_name, name
# Where `name` is the worktree directory name (e.g. "agent-a1b2c3d4").
# The full path is $CLAUDE_PROJECT_DIR/.claude/worktrees/<name>.

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
  exit 0
fi

WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$NAME"
echo "$(date '+%H:%M:%S') WORKTREE_PATH: '$WORKTREE_PATH'" >> "$LOG"

# Hook may fire BEFORE git worktree add finishes. Poll briefly.
for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ -d "$WORKTREE_PATH" ]; then break; fi
  sleep 0.5
done

if ! cd "$WORKTREE_PATH" 2>/dev/null; then
  echo "$(date '+%H:%M:%S') Worktree not ready after 5s — exiting silently" >> "$LOG"
  exit 0
fi

echo "$(date '+%H:%M:%S') Setting up worktree: $WORKTREE_PATH" >> "$LOG"

# Initialize submodules (independent clones, not symlinks)
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

echo "$(date '+%H:%M:%S') Worktree setup complete" >> "$LOG"
exit 0
