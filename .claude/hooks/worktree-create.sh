#!/bin/bash
# Hook: WorktreeCreate
# Runs when Claude Code creates a temporary agent worktree (isolation: "worktree").
# Sets up submodules, dependencies, and direnv in the new worktree.

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path // empty')

if [ -z "$WORKTREE_PATH" ]; then
  exit 0
fi

LOG="/tmp/worktree-create-hook.log"
echo "$(date '+%H:%M:%S') Setting up worktree: $WORKTREE_PATH" >> "$LOG"

cd "$WORKTREE_PATH" || exit 0

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
