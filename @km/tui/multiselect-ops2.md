---
id: "@km/tui/multiselect-ops2"
aliases:
  - km-tui.multiselect-ops2
  - km-tui-multiselect-ops2
created_by: claude:084f044c
created_at: 2026-02-12T11:28:03Z
closed_at: 2026-02-12T12:00:57Z
owner: bjorn@stabell.org
assignee: claude:084f044c
---

# [x] Multi-select operations: batch delete, status toggle @km/tui #feature #P2 @claude:084f044c

Extend batch operation support to remaining single-node-only operations:

## Operations to add
1. **Batch delete** — Delete all selected nodes. Show confirmation dialog if ANY node has children/backlinks. All-or-nothing: if user cancels, nothing is deleted.
2. **Batch status toggle** — Cycle task status (x key) on all selected nodes. Only affects structural types (task, section).

## Existing pattern
Indent/outdent and move already use `getSelectedCardIndices()` with atomic batch semantics. Follow the same pattern:
- Validate all before executing any
- Process in correct order (bottom-up for delete to avoid index invalidation)
- Clear selection after operation
- Cursor follows first node

## Key files
- `apps/km-tui/src/board/board-actions-edit.ts` — handleDeleteNode (needs multi-select)
- `apps/km-tui/src/keyboard/keyboard-card-ops.ts` — getSelectedCardIndices pattern
- `apps/km-tui/src/keyboard/keyboard-helpers.ts` — getSelectedCardIndices utility