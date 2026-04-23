#!/bin/bash
# Hook: WorktreeRemove
# Fires when Claude Code finishes with an Agent worktree (isolation: "worktree").
#
# The 2026-04-23 cp-c isolation rewrite changed what "worktree" means:
# clones now live at $PROJECT_DIR/.claude/worktrees/$NAME and have their
# OWN .git directory (not a git-worktree shadow). There is no shared
# .git/worktrees/<name>/modules/ to scrub — each clone is fully self-
# contained.
#
# We do NOT auto-delete the clone directory. An Agent may leave uncommitted
# work there that the user wants to recover. Manual cleanup:
#
#   ls .claude/worktrees/                        # inspect
#   bun worktree list                            # if using bun worktree
#   /bin/rm -rf .claude/worktrees/<name>         # deliberate removal
#
# Future: a `bun worktree gc` command could prune clones older than N days
# with no uncommitted changes. Until then, this hook only logs.

LOG="/tmp/worktree-remove-hook.log"
INPUT=$(cat)
echo "$(date '+%H:%M:%S') INPUT: $INPUT" >> "$LOG"

NAME=$(echo "$INPUT" | jq -r '.name // empty')
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
fi

if [ -n "$NAME" ]; then
  WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$NAME"
  if [ -d "$WORKTREE_PATH" ]; then
    DIRTY=""
    if cd "$WORKTREE_PATH" 2>/dev/null; then
      CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
      if [ -n "$CHANGES" ] && [ "$CHANGES" != "0" ]; then
        DIRTY=" (${CHANGES} uncommitted change(s) — preserved)"
      fi
    fi
    echo "$(date '+%H:%M:%S') [$NAME] clone preserved at $WORKTREE_PATH$DIRTY" >> "$LOG"
  fi
fi

echo '{"continue": true}'
exit 0
