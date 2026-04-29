---
id: "@km/silvery/tea-composite-ops"
aliases:
  - km-silvery.tea-composite-ops
  - km-silvery-tea-composite-ops
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:44Z
---

# [ ] Composite op primitive for atomic multi-domain transactions @km/silvery #feature #P1

blocks:: [[@km/silvery/tea]], [[@km/silvery/tea-state-delta-convention]]

Pro review 2026-04-21: middleware chain can't cleanly handle multi-domain atomic updates (delete node while editing text touches tree + selection + editor + undo + storage). Add { type: 'composite', ops: Op[] } as first-class primitive. One plugin (withAtomicOps or outermost-inner, usually withUndo) unpacks + dispatches sub-ops transactionally. Sub-ops produce effects only, never further dispatch. Blocker for withUndo (Phase 6). Context: hub/silvery/tea-review-responses.md §2.