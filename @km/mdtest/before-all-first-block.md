---
id: "@km/mdtest/before-all-first-block"
aliases:
  - km-mdtest.before-all-first-block
  - km-mdtest-before-all-first-block
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:56Z
closed_at: 2026-03-14T01:34:31Z
close_reason: Closed
---

# [x] mdtest: beforeAll only works when defined in first block @km/mdtest #bug #P2

Code calls executor.beforeAll() exactly once after first handled block regardless of whether that block defined the hook. beforeAll() defined later in document is never invoked. Fix: pre-scan blocks for hook definitions, or detect defining block and invoke immediately. index.ts:318-323. Found by GPT 5.4 Pro review.