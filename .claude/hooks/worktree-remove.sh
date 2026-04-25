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
# Auto-cleanup policy (added 2026-04-24 after 23-clone meltdown):
#   - clean       (HEAD in main, no uncommitted, no unique branches) → DELETE
#   - broken      (no .git, cancelled cp orphan)                     → DELETE
#   - dirty       (uncommitted changes)                              → preserve
#   - unique-work (commits/branches not in main, not on remote)      → preserve
#
# The "preserve uncommitted/unique work" guarantee is the original reason
# this hook never auto-deleted. With explicit classification, the guarantee
# applies exactly when it matters and clones don't accumulate when it
# doesn't. Manual recovery for preserved clones:
#
#   ls .claude/worktrees/                        # inspect
#   /usr/bin/trash .claude/worktrees/<name>      # deliberate (recoverable)
#   bun worktree gc                              # bulk prune

LOG="/tmp/worktree-remove-hook.log"
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
if [ ! -d "$WORKTREE_PATH" ]; then
  echo "$(date '+%H:%M:%S') [$NAME] not present at $WORKTREE_PATH" >> "$LOG"
  echo '{"continue": true}'
  exit 0
fi

# Classify and decide.
CLS="unknown"
if [ -f "$LIB_DIR/classify-clone.sh" ]; then
  # shellcheck source=../lib/classify-clone.sh
  source "$LIB_DIR/classify-clone.sh"
  CLS=$(classify_clone "$WORKTREE_PATH" 2>/dev/null)
fi

case "$CLS" in
  clean|broken)
    # Prefer /usr/bin/trash for recoverability (macOS). Falls back to rm -rf
    # only if trash is unavailable — keeps the cleanup hook from blocking
    # on missing tools, but loses Trash recovery.
    if [ -x /usr/bin/trash ]; then
      if /usr/bin/trash "$WORKTREE_PATH" 2>>"$LOG"; then
        echo "$(date '+%H:%M:%S') [$NAME] auto-cleanup ($CLS) → moved to Trash" >> "$LOG"
      else
        echo "$(date '+%H:%M:%S') [$NAME] trash failed, leaving in place" >> "$LOG"
      fi
    else
      rm -rf "$WORKTREE_PATH" 2>>"$LOG"
      echo "$(date '+%H:%M:%S') [$NAME] auto-cleanup ($CLS) → rm -rf" >> "$LOG"
    fi
    ;;
  dirty|unique-work)
    CHANGES=""
    if [ -e "$WORKTREE_PATH/.git" ]; then
      n=$( cd "$WORKTREE_PATH" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ' )
      [ -n "$n" ] && [ "$n" != "0" ] && CHANGES=" ($n uncommitted)"
    fi
    echo "$(date '+%H:%M:%S') [$NAME] preserved ($CLS$CHANGES) at $WORKTREE_PATH" >> "$LOG"
    ;;
  *)
    echo "$(date '+%H:%M:%S') [$NAME] classification failed — preserved at $WORKTREE_PATH" >> "$LOG"
    ;;
esac

echo '{"continue": true}'
exit 0
