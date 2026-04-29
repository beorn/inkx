---
id: "@km/mdtest/ellipsis-captures-lost"
aliases:
  - km-mdtest.ellipsis-captures-lost
  - km-mdtest-ellipsis-captures-lost
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:51Z
closed_at: 2026-03-14T01:28:39Z
close_reason: Closed
---

# [x] mdtest: ellipsis matching loses captured placeholders @km/mdtest #bug #P1

In matchLines(), the .../[...] branch probes recursive matches using {...caps} but on success returns {ok:true} without copying the probe's captures back into caller's caps. Any {{name:*}} captured after an ellipsis disappears, so later {{name}} reuses fail. Fix: merge probe's capture state back into caps on success. core.ts:212-218. Found by GPT 5.4 Pro review.