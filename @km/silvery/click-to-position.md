---
id: "@km/silvery/click-to-position"
aliases:
  - km-silvery.click-to-position
  - km-silvery-click-to-position
created_by: claude:4a5961be
created_at: 2026-03-16T19:23:48Z
closed_at: 2026-03-16T19:46:53Z
close_reason: >-
  Implemented click-to-position cursor support across 5 silvery components:


  1. EditTarget + UseEditContextResult (use-edit-context.ts): Added
  setCursorOffset(offset) method to interface and hook return value.


  2. EditContextDisplay (EditContextDisplay.tsx): Added onCursorClick prop with
  onMouseDown handler. Maps (clientX, clientY) -> wrappedLine row/col ->
  character offset, accounting for scroll offset.


  3. CursorLine (CursorLine.tsx): Added onCursorClick prop. When provided, wraps
  content in Box with onMouseDown. Maps clientX -> character offset.


  4. TextInput (TextInput.tsx): Added onMouseDown to outer Box. Maps click
  position to cursor offset accounting for prompt length. Uses
  readline.setValueWithCursor().


  5. TextArea (TextArea.tsx): Added onMouseDown to outer Box. Maps (row, col)
  through wrappedLines accounting for scroll offset. Added setCursor(offset) to
  useTextArea hook (useTextArea.ts).


  All props are optional (backward compatible). Left-button only (button === 0).
  Uses screenRect.x/y (not .left/.top) from TeaNode.


  Tests: vendor/silvery/tests/features/click-to-position.test.tsx (26 tests) -
  component rendering, useEditContext setCursorOffset, offset calculation unit
  tests, edge cases.
---

# [x] Click-to-position cursor in TextInput/TextArea @km/silvery #feature #P2 @claude:4a5961be

Add onClick handler to TextInput and TextArea that maps terminal (x,y) coordinates to a cursor position within the text.

**TextInput**: Map clientX to cursor offset by subtracting prompt length and the component's screenRect.left, clamped to [0, value.length].

**TextArea**: Map (clientX, clientY) to (row, col) using wrappedLines array + scrollOffset, then convert to character offset via wrappedLines[row].startOffset + col.

**Infrastructure already exists**: SGR 1006 mouse protocol, hit testing (hitTest → deepest node), onClick/onMouseDown event dispatch with bubbling, SilveryMouseEvent with clientX/clientY and modifier keys, click-to-focus (findFocusableAncestor). Just need the last step: coordinate → cursor offset mapping.

**Follow-on**: Double-click to select word (double-click detection already exists in mouse-events.ts).