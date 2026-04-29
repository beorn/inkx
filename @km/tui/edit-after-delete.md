---
id: "@km/tui/edit-after-delete"
aliases:
  - km-tui.edit-after-delete
  - km-tui-edit-after-delete
created_by: Bjørn Stabell
created_at: 2026-04-10T23:49:26Z
closed_at: 2026-04-11T00:21:49Z
close_reason: "Fixed: text.edit() + requestRenderFlush() after executeDelete.
  Root cause: unmount auto-save cleared new text selection, unconditional
  deselect in confirm callbacks, missing initialCursorPos passthrough. Commit
  00d1fac13."
owner: bjorn@stabell.org
---

# [x] Backspace on empty card should stay in edit mode on previous sibling @km/tui #task #P2

When editing an empty card and pressing backspace, the card is deleted and cursor drops to node mode. Should enter edit mode on the previous sibling at end of content (SlateJS-style). Same for forward-delete on empty card — should edit next sibling. Blocked by: text.edit() signal does not persist through the render cycle after executeDelete. The sel.transform + clearSelection in executeDelete clear text selection. Needs investigation into how to compose node deletion with edit mode re-entry. See TODO markers in board-actions.ts TEXT_DELETE_BACKWARD/FORWARD.