#!/bin/bash
# Hook: WorktreeRemove
# Runs when Claude Code removes a temporary agent worktree (isolation: "worktree").
# Cleans up the per-worktree submodule modules directory so git doesn't leave
# orphans at .git/worktrees/<name>/modules/*.
#
# Claude Code sends JSON via stdin with fields:
#   session_id, transcript_path, cwd, hook_event_name, name
# `name` is the worktree dir name (e.g. "agent-a1b2c3d4").

LOG="/tmp/worktree-remove-hook.log"
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

# Resolve the common git dir (the main repo's .git, not the worktree's gitdir file)
# For a regular clone this is just <project>/.git.
GIT_COMMON_DIR="$PROJECT_DIR/.git"
if [ ! -d "$GIT_COMMON_DIR" ]; then
  # Might be a gitlink; resolve via git itself.
  if command -v git &>/dev/null; then
    RESOLVED=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --git-common-dir 2>/dev/null)
    if [ -n "$RESOLVED" ]; then
      case "$RESOLVED" in
        /*) GIT_COMMON_DIR="$RESOLVED" ;;
        *)  GIT_COMMON_DIR="$PROJECT_DIR/$RESOLVED" ;;
      esac
    fi
  fi
fi

MODULES_DIR="$GIT_COMMON_DIR/worktrees/$NAME/modules"
echo "$(date '+%H:%M:%S') [$NAME] MODULES_DIR=$MODULES_DIR" >> "$LOG"

# Detach cleanup to background so the hook returns immediately. Claude Code
# may invoke this before `git worktree remove` has finished tearing down the
# worktree metadata, so we wait briefly for the worktree dir to disappear, then
# scrub the per-worktree modules tree. If the modules dir is already gone,
# that's a no-op.
(
  WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$NAME"
  # Wait up to ~30s for git to finish removing the worktree dir.
  for i in $(seq 1 30); do
    if [ ! -d "$WORKTREE_PATH" ] && [ ! -f "$WORKTREE_PATH/.git" ]; then break; fi
    sleep 1
  done

  if [ -d "$MODULES_DIR" ]; then
    echo "$(date '+%H:%M:%S') [$NAME] scrubbing per-worktree submodule modules" >> "$LOG"
    rm -rf "$MODULES_DIR" 2>>"$LOG"
    echo "$(date '+%H:%M:%S') [$NAME] cleanup complete" >> "$LOG"
  else
    echo "$(date '+%H:%M:%S') [$NAME] no modules dir (already clean)" >> "$LOG"
  fi

  # Also prune stale worktree metadata if the worktree dir is gone
  if [ ! -d "$WORKTREE_PATH" ] && [ -d "$PROJECT_DIR" ]; then
    (cd "$PROJECT_DIR" && git worktree prune 2>>"$LOG") || true
  fi
) </dev/null >/dev/null 2>&1 &
disown

# Tell Claude Code we succeeded (non-blocking)
echo '{"continue": true}'
exit 0
