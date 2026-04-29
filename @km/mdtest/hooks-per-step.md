---
id: "@km/mdtest/hooks-per-step"
aliases:
  - km-mdtest.hooks-per-step
  - km-mdtest-hooks-per-step
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:54Z
closed_at: 2026-03-14T01:29:26Z
close_reason: Closed
---

# [x] mdtest: Bun/Vitest integrations run hooks per command step, not per block @km/mdtest #bug #P1

registerNestedTests() explodes each block into one test per parsed step, while beforeEach/afterEach are attached to the runner. Changes semantics from CLI — hooks run between commands in multi-command blocks. beforeAll can run mid-block. Affects both Bun and Vitest integrations. Fix: one test per markdown block. integrations/bun.ts, integrations/vitest.ts. Found by GPT 5.4 Pro review.