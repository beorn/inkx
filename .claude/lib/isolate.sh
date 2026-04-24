#!/bin/bash
# isolate.sh — Clone a git working tree for isolated concurrent use.
#
# Primary path: APFS copy-on-write (macOS `cp -c -R`). Data blocks are shared
# with the source until written; per-file directory entries are created in
# the target. For the km repo (13G, ~500K files) this takes ~20-25s — the
# cost is directory traversal, not data copy.
#
# Fallback: `tar cf - | tar xf -` pipe. Same O(files) cost, no CoW. Used on
# non-APFS filesystems (Linux, remote-mounted paths).
#
# Post-clone fixups:
#   1. Rewrite submodule `.git` files to point to the clone's .git/modules/*
#      instead of the source's (they're absolute paths; cp doesn't translate).
#   2. Remove stale `.git/index.lock` and `.git/modules/*/index.lock` files
#      (copied if the source had git running during the clone).
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

  # Canonicalize paths — submodule .git rewrites need absolute paths.
  source=$(cd "$source" && pwd -P)
  local target_parent
  target_parent=$(dirname "$target")
  mkdir -p "$target_parent"
  target_parent=$(cd "$target_parent" && pwd -P)
  target="$target_parent/$(basename "$target")"

  # Serialize the heavy I/O step across sessions. Without this, two
  # tribe sessions both running `isolation: "worktree"` at the same time
  # hit I/O contention long enough that the harness times out the
  # spawning Agent's hook and emits "Hook cancelled" — observed
  # 2026-04-24 with three lifecycle-scope agents cancelled while
  # tribe-cp jobs were running. One clone takes ~20-25s on the km repo;
  # two in parallel stretches past the harness ceiling.
  #
  # Implementation: mkdir-based atomic lock (portable — no flock on
  # macOS). Subshell + EXIT trap ensures the lock is released even on
  # error paths. Stale locks are reaped if their owning pid is dead.
  # Lock wraps ONLY the cp/tar block; fixups proceed unlocked since
  # they don't contend significantly.
  local lockdir="${TMPDIR:-/tmp}/silvery-clone.lock"
  (
    trap 'rm -rf "$lockdir" 2>/dev/null' EXIT
    _wait_for_clone_lock "$lockdir" || exit 1
    /bin/echo "$$" > "$lockdir/pid" 2>/dev/null

    # Primary path: APFS copy-on-write via /bin/cp (macOS).
    # -c: clone file data (O(1) per file instead of byte copy)
    # -R: recursive
    # Fall back to tar pipe on failure (non-APFS, Linux, etc).
    if /bin/cp -c -R "$source" "$target" 2>/dev/null; then
      exit 0
    fi
    # tar fallback — preserves symlinks, permissions, xattrs. No CoW.
    mkdir -p "$target"
    if ! (cd "$source" && tar -cf - .) | (cd "$target" && tar -xf -); then
      echo "isolate_worktree: tar fallback failed" >&2
      exit 1
    fi
  ) || return $?

  _fix_submodule_gitdirs "$source" "$target"
  _remove_stale_locks "$target"
  _reset_to_head "$target"
}

# Reset the clone's working tree to HEAD state in the main repo and every
# submodule. cp copied the source's uncommitted WIP verbatim; without this,
# the Agent sees the user's unstaged modifications (and could commit them as
# its own work) and also inherits whatever .claude/worktrees/* clones the
# source had (cascade). The clone starts from a known baseline.
_reset_to_head() {
  local target="$1"

  # Main repo — wipe tracked modifications + staged changes, then remove
  # untracked (but keep ignored dirs like node_modules/, .beads/dolt-*).
  (
    cd "$target" 2>/dev/null || exit 0
    git reset --hard HEAD >/dev/null 2>&1 || true
    git clean -fd >/dev/null 2>&1 || true
    # Prevent clone cascade — don't inherit the source's agent worktrees.
    /bin/rm -rf .claude/worktrees 2>/dev/null || true
  )

  # Submodules — same drill. foreach --recursive covers nested submodules.
  (
    cd "$target" 2>/dev/null || exit 0
    git submodule foreach --recursive --quiet \
      'git reset --hard HEAD >/dev/null 2>&1; git clean -fd >/dev/null 2>&1' \
      >/dev/null 2>&1 || true
  )
}

# Rewrite every submodule .git file in the clone so its `gitdir:` points to
# the clone's .git/modules/* rather than the source's. cp preserves absolute
# paths verbatim; without this, commits in the clone land in the source's
# per-worktree module dir (breaking isolation).
_fix_submodule_gitdirs() {
  local source="$1"
  local target="$2"

  # Every submodule has a .git FILE (not dir) with content: "gitdir: <abspath>"
  # Find all such files under the clone, skipping the top-level .git which is
  # a normal directory in the main repo.
  find "$target" -name .git -type f -not -path "$target/.git" 2>/dev/null | while IFS= read -r sub_gitfile; do
    # Rewrite any reference to $source/.git → $target/.git
    perl -i -pe "s|\Q$source/.git\E|$target/.git|g" "$sub_gitfile" 2>/dev/null || true
  done
}

# Stale lock files from a copy taken while git was running. Safe to remove
# unconditionally in the clone (they name PIDs that own the SOURCE, not us).
_remove_stale_locks() {
  local target="$1"
  /bin/rm -f "$target/.git/index.lock" 2>/dev/null || true
  if [ -d "$target/.git/modules" ]; then
    find "$target/.git/modules" -name index.lock -type f 2>/dev/null | while IFS= read -r lock; do
      /bin/rm -f "$lock" 2>/dev/null || true
    done
  fi
}

# Block until the clone-serialization lock can be acquired. `mkdir` is
# atomic on POSIX — it either creates the dir (we hold the lock) or
# fails (someone else holds it). Held locks are short-lived (~25s per
# clone); the timeout handles truly wedged processes by surfacing a
# clear error rather than hanging forever.
#
# Deliberately NO pid-based staleness reaping — it's tempting (and was
# in the first cut), but the staleness logic has subtle race windows
# (process dies between cat-pid and rm-rf, fresh process gets same pid,
# etc.) and the failure mode is rare. If a stuck lockdir IS observed
# in practice, surface it via the timeout and let the user rmdir it.
_wait_for_clone_lock() {
  local lockdir="$1"
  local waited=0
  local max_wait=600  # 10 min — a single clone is ~25s, so 10 min is
                      # ~24 queued clones. Anything more is a hard fault.
  while ! mkdir "$lockdir" 2>/dev/null; do
    if [ "$waited" -ge "$max_wait" ]; then
      echo "isolate_worktree: clone-lock timeout (>${max_wait}s held by another session)" >&2
      echo "isolate_worktree: if this is wedged, run: rmdir '$lockdir'" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

# CLI entry — when invoked directly (not sourced).
# Usage: isolate.sh SOURCE TARGET
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  isolate_worktree "$1" "$2"
fi
