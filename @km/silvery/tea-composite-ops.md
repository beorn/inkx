---
id: "@km/silvery/tea-composite-ops"
aliases:
  - km-silvery.tea-composite-ops
  - km-silvery-tea-composite-ops
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:44Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-composite-ops
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-20T23:12:43Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-silvery.tea-composite-ops
    depends_on_id: km-silvery.tea-state-delta-convention
    type: blocks
    created_at: 2026-04-21T15:27:11Z
    created_by: claude:c1c8afe1
    metadata: "{}"
---

# [ ] Composite op primitive for atomic multi-domain transactions @km/silvery #feature #P1

blocks:: [[@km/silvery/tea]], [[@km/silvery/tea-state-delta-convention]]

Pro review 2026-04-21: middleware chain can't cleanly handle multi-domain atomic updates (delete node while editing text touches tree + selection + editor + undo + storage). Add { type: 'composite', ops: Op[] } as first-class primitive. One plugin (withAtomicOps or outermost-inner, usually withUndo) unpacks + dispatches sub-ops transactionally. Sub-ops produce effects only, never further dispatch. Blocker for withUndo (Phase 6). Context: hub/silvery/tea-review-responses.md §2.