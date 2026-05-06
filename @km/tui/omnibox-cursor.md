---
mentions:
  - km
  - claude
id: "@km/tui/omnibox-cursor"
aliases:
  - km-tui.omnibox-cursor
  - km-tui-omnibox-cursor
created_by: Bjørn Stabell
created_at: 2026-04-14T23:25:23Z
closed_at: 2026-04-20T19:42:13Z
owner: bjorn@stabell.org
assignee: claude:6093040b
dependencies:
  - issue_id: km-tui.omnibox-cursor
    depends_on_id: km-tui.omnibox-dialog
    type: blocks
    created_at: 2026-04-14T16:26:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-cursor
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:25:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tui.omnibox-dialog
      - type: link
        target: km-tui.omnibox-unified
---

# [x] Cursor unification via focus (Phase 6) @km/tui #task #P1 @claude:6093040b

blocks:: [[@km/tui/omnibox-dialog]], [[@km/tui/omnibox-unified]]

Phase 6: cursor unification via focus. One-function change in the app's currentCursor() lookup: if workspace.overlayPane is an omnibox AND it has focus, return its selectedArgument; else return the focused pane's cursor. Remove any dialog:omnibox scope guards.

Cleanup path:

1. In commandExecutor, replace the 'am I in a dialog?' special-case with a single currentCursor() call.
2. currentCursor() source-of-truth is: focusedSurface.cursor, where focusedSurface is overlayPane (if open) or activePane (if not).
3. Omnibox exposes .cursor accessor that reads selectedArgument (base-state field).

TEA-shim boundary: exactly ONE accessor (omnibox.cursor → selectedArgument). The command executor is the only caller. Commands read ctx.currentNodeId; they do not reach into OmniboxBaseState directly.

Acceptance:
(a) arrow in the omnibox → commands reading ctx.currentNodeId act on selectedArgument
(b) closing the omnibox restores currentCursor() to the previously-focused pane
(c) journey test: open cmd-f, arrow to a different result, dispatch goto via Enter, verify goto fires against that node
(d) dialog:omnibox scope guards removed from commandExecutor

