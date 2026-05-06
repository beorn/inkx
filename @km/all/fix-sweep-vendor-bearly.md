---
mentions:
  - km
  - claude
id: "@km/all/fix-sweep-vendor-bearly"
aliases:
  - km-all.fix-sweep-vendor-bearly
  - km-all-fix-sweep-vendor-bearly
created_by: claude:cc081a9a
created_at: 2026-04-26T20:24:58Z
closed_at: 2026-04-26T20:50:20Z
close_reason: Closed
started_at: 2026-04-26T20:37:12Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-vendor-bearly
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T13:25:02Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-0426
---

# [x] Fix vendor/bearly test failures + 20 tsc errors @km/all #task #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

Vendor/bearly cluster from fix-sweep-0426:

## Test failures (~10 across 5 files)

- vendor/bearly/plugins/llm/tests/* (4 files)
- vendor/bearly/plugins/recall/tests/history/recall.test.ts

## Tsc errors (20 in baseline)

- vendor/bearly/packages/vitest-silvery-dots/src/index.tsx (20 errors)
- vendor/bearly/tests/broadcast-coalescer.test.ts (20 errors)
- vendor/bearly/tools/lib/tribe/broadcast-coalescer.ts (1 error)
- vendor/bearly/tools/tribe-daemon.ts (1 error)

## Acceptance

- bun vitest run vendor/bearly/ passes (or remaining failures documented)
- Vendor tsc count for bearly reduced

Use general-purpose agent + worktree (vendor/bearly is its own submodule).

