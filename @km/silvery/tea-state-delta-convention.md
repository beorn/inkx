---
id: "@km/silvery/tea-state-delta-convention"
aliases:
  - km-silvery.tea-state-delta-convention
  - km-silvery-tea-state-delta-convention
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:44Z
---

# [ ] state_delta effect convention: undo + storage visibility @km/silvery #feature #P1

blocks:: [[@km/silvery/tea]]

K2.6 strongest critique: withUndo wrapping withTree sees ops + effects but NOT state deltas, so can't compute inverses. Fix: every mutating plugin MUST emit { type: 'state_delta', slice, inverse } for every op it consumes. withUndo records inverses from effects; withStorage persists based on slice. Contract test introspects plugin registry (via .mutates=true flag) and runs op transcript asserting delta emission. Blocker for withUndo (Phase 6) and withStorage (Phase 7). Context: hub/silvery/tea-review-responses.md §3–4.