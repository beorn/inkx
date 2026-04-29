---
id: "@km/core/slate-interfaces/p3-dialog-split"
aliases:
  - km-core.slate-interfaces.p3-dialog-split
  - km-core-slate-interfaces-p3-dialog-split
created_by: claude:ceb7c9cb
created_at: 2026-03-28T14:12:55Z
closed_at: 2026-03-28T14:29:33Z
close_reason: User decided 54-case handler is acceptable — decentralizing would
  add more complexity than it saves
---

# [x] Split DialogOp handler — 54 cases exceeds 25-case limit @km/core #task #P3 @claude:ceb7c9cb

## Gap from @km/core/slate-interfaces/p3-split-actions

handleDialogAction has 54 cases — more than double the 25-case limit from the bead. BoardOp has 28 (slightly over).

### Suggested split
DialogOp (54) could split into:
- **PickerOp** — item picker, project picker, tag picker, assignee picker
- **SearchOp** — search dialog, filter, search-replace
- **PromptOp** — date prompt, favorites, confirmations, help
- **PropertyOp** — node properties, task status, labels

### /complete
- No handler has >25 cases in board-actions.ts