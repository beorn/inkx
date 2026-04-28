#!/usr/bin/env bash
# Block stray `issues.jsonl` from being committed at the repo root.
#
# Why this script exists: bd v1.0.2 has a worktree-export bug
# (steveyegge/beads#3311) where the pre-commit hook resolves
# `export.path = "issues.jsonl"` against the worktree CWD instead of
# `.beads/`, causing it to `git add issues.jsonl` at repo root via
# `git update-index`. The file is never created on disk (so .gitignore
# doesn't help — `update-index` bypasses gitignore), but the index
# entry still produces a stray ~9 MB file in the commit.
#
# Three concurrent agents tripped on this in a single /max session
# 2026-04-28 (km-beads.export-path-relative). Five prior cleanup
# commits in main (search: "stray issues.jsonl", "root issues.jsonl",
# "hook artifact"). The bug is fixed upstream in bd v1.0.3
# (commit d0f0ad6f, GH#3311).
#
# Two layers of defense:
# 1. Upgrade bd to >=1.0.3 — primary fix, removes the bug.
# 2. This script — defense-in-depth gate that catches the bug if a
#    contributor is on stale bd, OR a future regression slips in.
#
# Hooked into `bun fix` so every commit-prep run catches it before the
# commit lands. Running this in CI also catches the issue at PR time.
#
# Bead: km-beads.export-path-relative
#
# UPSTREAM-WAITING(steveyegge/beads#3311): Delete when bd >= 1.0.3 universal
# Bead: km-beads.upstream-bd-1.0.3-export-path
# Escalate by: 2026-10-27

set -e

# Paths that must NEVER appear at the repo root. .beads/issues.jsonl
# (with the directory prefix) is the canonical export location and is
# allowed.
STRAY_PATHS=(
  "issues.jsonl"
)

EXIT=0

# Walk to repo root so `git ls-files` resolves correctly even when the
# script is invoked from a subdirectory (e.g. via package.json scripts).
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

for path in "${STRAY_PATHS[@]}"; do
  # Check both staged-in-index AND tracked-in-HEAD. `git ls-files <path>`
  # lists tracked entries at exactly that path (no recursion since the
  # path has no glob). Tracked files at root mean the bug already landed.
  if git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    echo "ERROR: stray '$path' tracked at repo root."
    echo "       This is the bd worktree-export bug (steveyegge/beads#3311)."
    echo
    echo "       Fix:"
    echo "         1. Upgrade bd to >=1.0.3:    brew upgrade beads"
    echo "         2. Remove the stray entry:   git rm --cached '$path'"
    echo "         3. Commit the removal."
    echo
    echo "       The canonical export path is .beads/issues.jsonl."
    EXIT=1
  fi
done

# Also check the index for paths that aren't yet committed but are about
# to be (e.g. catches `git add issues.jsonl` before `git commit`).
for path in "${STRAY_PATHS[@]}"; do
  if git diff --cached --name-only -- "$path" 2>/dev/null | grep -qx "$path"; then
    echo "ERROR: stray '$path' is staged for commit."
    echo "       Run: git rm --cached '$path' (the file is created by the bd hook bug)."
    EXIT=1
  fi
done

if [ "$EXIT" -eq 0 ]; then
  echo "OK: no-stray-issues-jsonl clean (.beads/issues.jsonl is the canonical export)"
fi

exit $EXIT
