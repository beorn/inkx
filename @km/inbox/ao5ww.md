---
id: "@km/_orphan/ao5ww"
aliases:
  - km-ao5ww
created_by: claude:efb76293
created_at: 2026-03-17T08:15:36Z
closed_at: 2026-03-17T08:17:40Z
close_reason: "Fixed: --branch flag now parsed as a named option. Branch value
  is used as both the git branch and the worktree directory name (e.g., `bun
  worktree create --branch km-ila18-theme-inherit` creates dir
  `km--km-ila18-theme-inherit` on branch `km-ila18-theme-inherit`). Previously,
  `--branch` was treated as a positional arg, creating `km---branch`."
owner: bjorn@stabell.org
---

# [x] Worktree tool: --branch flag mangles directory name @km/_orphan #bug #P2

bun worktree create --branch @km/_orphan/ila18-theme-inherit creates a worktree at /Users/beorn/Code/pim/km---branch instead of something sensible like /Users/beorn/Code/pim/km--@km/_orphan/ila18-theme-inherit or using the branch name as the directory suffix.

The --branch value is being used as a literal directory suffix (---branch) instead of incorporating the actual branch name.