---
id: "@km/silvery/listview-test-failures"
aliases:
  - km-silvery.listview-test-failures
  - km-silvery-listview-test-failures
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:25Z
closed_at: 2026-04-27T03:11:41Z
close_reason: "silvery d0c8a5dd Tier 1 buffer shift gates on overlapping
  absolute siblings + popover updates; km bumped 332906628.
  listview-scroll-overshoot + listview-scrollcap-tall-items: 8/8 pass."
started_at: 2026-04-26T23:23:55Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.listview-test-failures
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:35Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] vendor/silvery listview test cluster — 5 failures (2 files) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

listview-scroll-overshoot.test.tsx (2) + listview-scrollcap-tall-items.test.tsx (3). /complete: bun vitest run --project vendor vendor/silvery/tests/features/listview-scroll-overshoot.test.tsx vendor/silvery/tests/features/listview-scrollcap-tall-items.test.tsx → 0 failures.