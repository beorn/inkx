---
id: "@km/bearly/worktree-create-silvery-symlinks"
aliases:
  - km-bearly.worktree-create-silvery-symlinks
  - km-bearly-worktree-create-silvery-symlinks
created_by: claude:cc081a9a
created_at: 2026-04-27T07:05:36Z
closed_at: 2026-04-27T07:29:29Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.worktree-create-silvery-symlinks
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-27T00:05:36Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] bun worktree create: symlink @silvery/* sub-packages @km/bearly #bug #P3

blocks:: [[@km/bearly]]

Three Phase 1 agents (scope-ownership, paint-clear, feedback-trace) all hit the same friction: their fresh worktrees did not have @silvery/ag, @silvery/config, @silvery/ink, @silvery/syntax linked into node_modules. Each agent had to symlink them manually before tests would resolve.

The build-info.gen.ts side of the friction is fixed by the postinstall hook in 27b6fe8cd. The @silvery/* symlink side remains.

## Reproducer

1. bun worktree create some-bead
2. cd .claude/worktrees/<name>
3. bun vitest run --project=vendor
4. Module-not-found errors for @silvery/ag (or any other unbuilt @silvery sub-package)

## Probable root cause

bun install in a worktree may not resolve workspace links for unbuilt packages, OR the cp -c -R clone may not include node_modules symlinks if they were soft-links rather than directories. Need investigation in vendor/bearly/tools/worktree.ts and .claude/lib/isolate.sh.

## /complete

- bun worktree create on a fresh bead → cd in → bun vitest run --project=vendor passes 11367 tests without any manual symlinking
- Three previous-failure agents would have completed without the manual symlink step

## Why P3 not P2

Workaround is straightforward (manual symlinking) and agents have demonstrated they can recover from it. Fixing it removes friction but doesn't unblock anything new.

Origin: feedback-trace + paint-clear + scope-ownership trio reports during @km/all/plateau-90 sweep.