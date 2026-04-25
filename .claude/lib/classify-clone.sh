#!/bin/bash
# classify-clone.sh — Classify the state of an agent-isolation clone.
#
# Input: a path to a clone under .claude/worktrees/agent-*. The clone is a
# full repo (its own .git, not a git-worktree shadow), made via cp -c -R.
#
# Output: one word on stdout, one of:
#   broken      — no .git directory (cancelled cp orphan)
#   dirty       — has uncommitted changes (preserve for user recovery)
#   unique-work — has commits or branches not reachable from main (preserve)
#   clean       — HEAD reachable from main, no uncommitted, no unique branches
#
# Exit code:
#   0 — classification written to stdout
#   2 — invalid arguments
#
# Why a separate classification function: worktree-create.sh needs it to
# count "clean stale" clones (gating); worktree-remove.sh needs it to decide
# preserve-vs-delete; bun worktree gc needs it for the same reason. Single
# source of truth in shell so the hooks have no Bun startup latency.
#
# Cost: ~3 git operations per clone (rev-parse, merge-base, status). On the
# km repo each takes ~30ms, so ~100ms per clone. Acceptable for hook gating.

classify_clone() {
  local wt="$1"
  if [ -z "$wt" ] || [ ! -d "$wt" ]; then
    return 2
  fi
  if [ ! -e "$wt/.git" ]; then
    echo "broken"
    return 0
  fi

  # Uncommitted changes? Preserve for user recovery.
  local porcelain
  porcelain=$(cd "$wt" && git status --porcelain 2>/dev/null | head -1)
  if [ -n "$porcelain" ]; then
    echo "dirty"
    return 0
  fi

  # HEAD reachable from main? If not, the clone has commits the user might
  # care about (agent worked, committed, never merged).
  local head_sha
  head_sha=$(cd "$wt" && git rev-parse HEAD 2>/dev/null)
  if [ -z "$head_sha" ]; then
    # .git exists but rev-parse failed — treat as broken.
    echo "broken"
    return 0
  fi
  if ! ( cd "$wt" && git merge-base --is-ancestor "$head_sha" main 2>/dev/null ); then
    echo "unique-work"
    return 0
  fi

  # Any local-only branches with commits not in main? Same preservation
  # principle — agent could have committed to a branch and not merged.
  local has_unique_branch=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local sha="${line%% *}"
    # Skip if commit is reachable from main (already merged content).
    if ( cd "$wt" && git merge-base --is-ancestor "$sha" main 2>/dev/null ); then
      continue
    fi
    # Skip if commit is reachable from any remote (pushed branch, just not
    # main yet — still safe to delete since pushed work isn't lost).
    if ( cd "$wt" && git branch -r --contains "$sha" 2>/dev/null | grep -q . ); then
      continue
    fi
    has_unique_branch=1
    break
  done < <( cd "$wt" && git for-each-ref --format='%(objectname) %(refname:short)' refs/heads 2>/dev/null )

  if [ "$has_unique_branch" = 1 ]; then
    echo "unique-work"
    return 0
  fi

  echo "clean"
  return 0
}

# CLI entry: bash classify-clone.sh <path>
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  classify_clone "$1"
fi
