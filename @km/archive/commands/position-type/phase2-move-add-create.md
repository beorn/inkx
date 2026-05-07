---
mentions:
  - km
  - claude
id: "@km/commands/position-type/phase2-move-add-create"
aliases:
  - km-commands.position-type.phase2-move-add-create
  - km-commands-position-type-phase2-move-add-create
created_by: claude:ceb7c9cb
created_at: 2026-03-28T00:39:06Z
closed_at: 2026-03-28T02:17:35Z
close_reason: moveTo→REPARENT_TO, addTo→LINK_TO, createIn→CREATE_AT. 6 action
  types deleted. Structural handlers (no card/column branching). All 4646 tests
  pass.
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Phase 2: move + add + create + structural cleanup @km/commands #task #P2 @claude:ceb7c9cb

Wire move, add, create verbs through VerbAction { type, at?, to }. Delete all old action types.

## Changes

### Verb wiring

1. @km/_orphan/commands/src/verb-locations.ts — moveTo, addTo, createIn all return VerbAction with locationKey → Position | { pick }
2. @km/_orphan/commands/src/types.ts — Delete MoveToBoardAction, MoveToFavoriteAction, ShiftToTopAction, ShiftToBottomAction, AddLinkToBoardAction, AddLinkToFavoriteAction, AddLinkAction, SetLabelAction, SetAssigneeAction, ReparentPickerAction, ShowItemPickerAction, CaptureAction
3. @km/tui/src/board/board-actions.ts — Add move/add/create to executeVerb(). Delete old cases + handlers.

### Structural cleanup (eliminate card/column branching)

4. handleShiftCard — remove dual card/column path. Shift is just move(node, Position).
5. getSelectedCards → rename to getSelectedNodes, ensure works at column level too.
6. OUTDENT_NODE from chord 'm p' → goes through VerbAction. Tab indent/outdent keeps INDENT_NODE/OUTDENT_NODE for now (has canOutdent validation).

## Delete

MoveToBoardAction, MoveToFavoriteAction, ShiftToTopAction, ShiftToBottomAction, AddLinkToBoardAction, AddLinkToFavoriteAction, AddLinkAction, SetLabelAction, SetAssigneeAction, ReparentPickerAction, ShowItemPickerAction, CaptureAction, handleMoveToBoard, handleShiftToExtreme (absorbed into executeVerb)

## /complete

- grep -r 'MOVE_TO_BOARD\|MOVE_TO_FAVORITE\|SHIFT_TO_TOP\|SHIFT_TO_BOTTOM' packages/@km/_orphan/commands/src/ apps/@km/tui/src/board/ → 0
- grep -r 'ADD_LINK_TO_BOARD\|ADD_LINK_TO_FAVORITE\|SET_LABEL\|SET_ASSIGNEE' packages/@km/_orphan/commands/src/ apps/@km/tui/src/board/ → 0
- grep -r 'REPARENT_PICKER\|SHOW_ITEM_PICKER\|CAPTURE' packages/@km/_orphan/commands/src/verb-locations.ts → 0
- grep -r 'handleMoveToBoard\|handleShiftToExtreme' apps/@km/tui/ → 0
- grep 'getSelectedCards' apps/@km/tui/ → 0 (renamed to getSelectedNodes)
- All tests pass

