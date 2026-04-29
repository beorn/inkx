---
id: "@km/flexily/silvercode-gutter"
aliases:
  - km-flexily.silvercode-gutter
  - km-flexily-silvercode-gutter
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:37Z
closed_at: 2026-04-26T23:27:06Z
close_reason: "Fixed: removed leftover debug console.log from NARROW + MINIMAL
  tests. Vitest setup throws on per-test console output; the layout assertions
  (gutter width=1) were already passing — the actual bug fix shipped earlier in
  flexily c34237b ('respect explicit setFlexShrink(0) for overflow children').
  Test now passes 4/4. Verified all 1634 flexily tests pass. Commits: flexily
  81c4011 + km d3977e164."
---

# [x] [bug] vendor/flexily silvercode-gutter-bug — 2 failures (NARROW + WIDE) @km/flexily #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

silvercode-gutter-bug.test.ts:116 (NARROW) + :174 (WIDE). gutter.minContentRow=200 in logs. /complete: bun vitest run --project vendor vendor/flexily/tests/silvercode-gutter-bug.test.ts → 0 failures.