---
mentions:
  - km
  - Bjørn
id: "@km/tui/enter-jumps-board"
aliases:
  - km-tui.enter-jumps-board
  - km-tui-enter-jumps-board
created_by: Bjørn Stabell
created_at: 2026-04-01T05:48:00Z
closed_at: 2026-04-02T19:48:53Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Enter after edit jumps to board level instead of creating sibling @km/tui #bug #P1 @Bjørn Stabell

Enter after edit jumps to board level instead of creating sibling.

## Investigation

- Traced the Enter keybinding chain during inline edit
- The keybinding predicates (editLevel, cursorAtEnd, hasVisibleChildren) control which behavior fires:
  - text.linebreak_after: creates sibling (when editLevel=card, cursorAtEnd, no visible children)
  - text.linebreak_child: creates child (when editLevel!=card OR has visible children)
  - text.linebreak_split: splits content (when cursor in middle)
- editLevel() depends on ctx.isAtCardLevel, which depends on node being in nodeIndex
- If cursor node is not found in nodeIndex, colIndex=-1, editLevel returns "board"
- This would cause Enter to dispatch wrong command, potentially exiting edit mode

## Root Cause Hypothesis

After creating a new node (via Enter in edit), the render flush should update columns. If the flush fails or the node's type prevents it from appearing as a card (e.g., missing item:true), editLevel would return the wrong value on the next Enter press. The existing tests pass for standard scenarios, suggesting this may be a specific node configuration or timing issue.

## Fix

Added invariant checks that detect:

- cursor-in-columns: cursor exists in repo but not in any column (the exact symptom)
- edit-node-in-columns: edit target not resolvable in columns
These will crash in KM_STRICT=1 mode, making the issue immediately visible.

Tests added to board-edit.slow.spec.ts for Enter-after-edit scenarios.

