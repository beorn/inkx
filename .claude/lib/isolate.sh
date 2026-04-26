#!/bin/bash
# isolate.sh — Create an isolated git worktree for an agent.
#
# Strategy: `git worktree add --detach` creates a new working tree that
# shares the source's `.git` database (no object copy). On the km repo
# this takes ~0.3s — orders of magnitude faster than the old `cp -c -R`
# approach which copied 15G/134K files in ~25s.
#
# Post-create steps:
#   1. `git submodule update --init --recursive` — the worktree starts
#      with empty submodule directories; this populates them. Each
#      submodule clones into the worktree's per-worktree modules dir
#      (`.git/worktrees/<name>/modules/...`). ~15-20s for the km repo's
#      9 submodules — most of the wall time. Recursive init may emit
#      non-fatal "fatal: No url found" for nested submodules in
#      vendor/termless/sites/* (pre-existing upstream issue); the main
#      repo's submodules all check out cleanly regardless.
#   2. Symlink `node_modules` from source to target. This avoids a 1.3G
#      copy of 63K entries. Constraint: agents must NOT run `bun install`
#      in the worktree — that mutates the source's node_modules. Since
#      the source's lockfile is the source of truth, agents should only
#      run code, never install.
#
# Concurrency: `git worktree add` is fast enough (<1s) that lock
# serialization is unnecessary. Submodule init has its own per-submodule
# locks inside .git/modules/*; they hold briefly and don't contend
# noticeably across concurrent worktree creates.
#
# Why not cp -c -R: see km-infra.worktree-clone-too-slow. APFS CoW is
# O(directory entries), not O(bytes), so even shared blocks don't help
# when the entry count is high. `git worktree add` shares the .git
# entirely — there's no entry copy to do.
#
# Usage (as library):
#   source /path/to/isolate.sh
#   isolate_worktree "$SOURCE_DIR" "$TARGET_DIR"
#
# Usage (standalone CLI):
#   bash isolate.sh "$SOURCE_DIR" "$TARGET_DIR"

set -e

isolate_worktree() {
  local source="$1"
  local target="$2"

  if [ -z "$source" ] || [ -z "$target" ]; then
    echo "isolate_worktree: usage: isolate_worktree SOURCE TARGET" >&2
    return 2
  fi
  if [ ! -d "$source" ]; then
    echo "isolate_worktree: source does not exist: $source" >&2
    return 2
  fi
  if [ -e "$target" ]; then
    echo "isolate_worktree: target already exists: $target" >&2
    return 2
  fi

  # Canonicalize paths.
  source=$(cd "$source" && pwd -P)
  local target_parent
  target_parent=$(dirname "$target")
  mkdir -p "$target_parent"
  target_parent=$(cd "$target_parent" && pwd -P)
  target="$target_parent/$(basename "$target")"

  # Create the worktree (detached HEAD at source's current HEAD).
  if ! git -C "$source" worktree add "$target" --detach 2>&1; then
    echo "isolate_worktree: git worktree add failed" >&2
    return 1
  fi

  # Init submodules. Errors from nested submodules with missing URLs are
  # non-fatal (pre-existing upstream issue in vendor/termless/sites/*).
  if ! git -C "$target" submodule update --init --recursive 2>&1; then
    # Top-level submodules may have succeeded even if recursive init
    # failed on a nested one. Don't return error — the agent can usually
    # still work. Log to stderr for visibility.
    echo "isolate_worktree: submodule recursive init had errors (likely vendor/termless/sites/* — non-fatal)" >&2
  fi

  # Symlink node_modules. Agents read from the symlink; if they need an
  # install, they should run it in source instead (and not in worktree).
  if [ -d "$source/node_modules" ] && [ ! -e "$target/node_modules" ]; then
    ln -s "$source/node_modules" "$target/node_modules"
  fi

  return 0
}

# CLI entry — when invoked directly (not sourced).
# Usage: isolate.sh SOURCE TARGET
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  isolate_worktree "$1" "$2"
fi
