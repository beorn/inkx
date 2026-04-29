---
id: "@km/tools/worktree-submodule-check"
aliases:
  - km-tools.worktree-submodule-check
  - km-tools-worktree-submodule-check
created_by: claude:656602a3
created_at: 2026-03-17T05:57:02Z
closed_at: 2026-03-17T07:25:57Z
close_reason: Added checkUnpushedSubmodules() call in mergeWorktree() after
  merge succeeds, before tests. Uses existing getSubmodulePaths() and
  checkUnpushedSubmodules() functions.
---

# [x] bun worktree: validate submodule commits are pushed after merge @km/tools #bug #P1

Worktree submodules are independent clones on detached HEAD. git push silently no-ops from detached HEAD. mergeWorktree() validates submodule commits before CREATE but not after MERGE. Lost @km/silvery/inline-rects implementation due to this.

Fix: call checkUnpushedSubmodules() in mergeWorktree() after merge succeeds, before worktree removal. The function already exists at line 198-224 of worktree.ts.

Also: warn during worktree creation that submodule commits need explicit push with refspec from detached HEAD.

See 5-why retrospective in session history.