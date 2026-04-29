---
id: "@km/silvery/sel-p6-undo"
aliases:
  - km-silvery.sel-p6-undo
  - km-silvery-sel-p6-undo
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:56Z
closed_at: 2026-04-04T20:21:51Z
---

# [x] Selection Phase 4: Undo + op() proxy @km/silvery #task #P2 @Bjørn Stabell

Selection undo via TEA op log — same mechanism as tree operations.

## Approach
- op(sel).node.select([id]) routes through TEA apply() pipeline
- Each op records { path, args, before: SelectionSnapshot, after: SelectionSnapshot }
- Undo = restore before snapshot (not logical inverse)
- Redo = restore after snapshot
- Same mechanism as UndoableRepo — selection joins the existing pipeline

## What changes
- Wire sel operations through op() proxy
- TEA middleware captures before/after SelectionSnapshot per op
- Undo stack includes selection ops alongside tree ops
- Combined undo: tree mutation + selection change undo together in one batch

## Tests
- Undo restores previous selection (roundtrip)
- Redo restores forward selection
- Batch undo: tree op + selection op undo together
- Undo after drag commit restores pre-drag state

## NOT needed
- Custom undo stack for selection (use TEA)
- Logical inverse functions (snapshot-based is simpler and always correct)
- Separate undo history (selection ops in the same log as tree ops)

## Depends on
- op() proxy implementation (TEA v1.5 infrastructure)
- P3 km migration complete