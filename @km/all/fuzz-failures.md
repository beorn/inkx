---
mentions:
  - km
  - claude
id: "@km/all/fuzz-failures"
aliases:
  - km-all.fuzz-failures
  - km-all-fuzz-failures
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:42Z
closed_at: 2026-04-27T05:08:16Z
close_reason: "silvery 168b4989 (clearExcessArea hasPrevBuffer guard) + km
  05c671feb. Same root cause: clearExcessArea was firing for absolute-positioned
  children even when parent's absoluteChildMutated cascade had already
  re-rendered siblings. Fix: gate on hasPrevBuffer. ai-chat 5/5 pass, fuzz 21/21
  files / 722/722 tests pass."
started_at: 2026-04-26T23:24:25Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fuzz-failures
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:37Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-vendor-fuzz
---

# [x] [bug] fuzz failures — navigation-fuzz (4) + render-fuzz (1) + listview-scroll-properties (1) @km/all #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

apps/@km/tui/tests/navigation-fuzz.fuzz.ts (comprehensive, basic, zoom, view-mode), apps/@km/tui/tests/render-fuzz.fuzz.ts (scrolling-tiny seed=42), vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx (4 invariants under random combinations). /complete: bun vitest run --project fuzz → 0 failures.

