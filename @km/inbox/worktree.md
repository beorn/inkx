---
id: "@km/_orphan/worktree"
aliases:
  - km-worktree
created_at: 2026-01-30T12:52:42Z
closed_at: 2026-01-30T13:08:19Z
assignee: claude:17efd9ed
---

# [x] Create /worktree skill for git worktree management @km/_orphan #feature #P2 @claude:17efd9ed

## Problem
Git worktrees are difficult to use with km due to:
1. Submodule state separation - each worktree needs independent clones
2. Hook installation per worktree
3. Bun workspace/lock file conflicts
4. Direnv per-worktree allowlisting
5. setup.ts designed for single-use initialization

## Solution
Create a `/worktree` skill with shell scripts for:
- `scripts/worktree-create.sh <name> [branch]` - create worktree with proper submodule init
- `scripts/worktree-remove.sh <name>` - clean removal
- `scripts/worktree-list.sh` - show status of all worktrees

## Features
- Automatic submodule initialization (not symlinks)
- Hook installation
- bun install
- direnv allow
- Status reporting

## Files to Create
- `.claude/skills/git/worktree.md` - skill documentation
- `scripts/worktree-create.sh` - creation script
- `scripts/worktree-remove.sh` - removal script
- `scripts/worktree-list.sh` - status script