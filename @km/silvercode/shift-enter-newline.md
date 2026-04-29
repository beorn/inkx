---
id: "@km/silvercode/shift-enter-newline"
aliases:
  - km-silvercode.shift-enter-newline
  - km-silvercode-shift-enter-newline
created_by: claude:230fa25d
created_at: 2026-04-26T05:17:31Z
closed_at: 2026-04-26T05:32:21Z
close_reason: >-
  Fixed and tested. Implementation summary:


  - km-silvercode.user-message-wrap: UserMessageBlock wraps long messages —
  added flexShrink={1} minWidth={0} to row Box and Prose container.

  - km-silvercode.commandbox-ctrl-u-scroll: MessageList no longer uses
  controlled cursor=-1; pins cursorKey to last message (or activity sentinel).
  Removes the Ctrl-U-triggered viewport-jump-to-top.

  - km-silvercode.tool-call-spacing: MessageItem column now has gap={1} so
  there's a consistent blank line between assistant text and the first tool call
  (also between consecutive tool calls).

  - km-silvercode.shift-enter-newline: silvery's useTextArea submit guards now
  check key.shift universally, so Shift+Enter inserts a newline regardless of
  submitKey. CommandBox's command region (submitKey='enter') gets multi-line
  composition automatically. Requires Kitty keyboard protocol (default in
  Ghostty/Kitty/WezTerm).

  - km-silvery.scrollbar-flex-mode: ListView trackHeight reads measured
  viewportSize.h in flex mode; gates removed; auto-flashes when item count
  grows.


  Tests: 2 new vendor tests (textarea-shift-enter, listview-flex-scrollbar), 232
  silvercode tests pass, regression sweep clean. Two unrelated stale tests
  updated (mutations.test.tsx mutation regex now handles SessionCard's '▎'
  stripe added 14h ago; side-panel-stays-visible.test.tsx now documents
  post-CSS-flip silvery defaults instead of inverted historical premise).
started_at: 2026-04-26T05:20:30Z
owner: bjorn@stabell.org
assignee: claude:230fa25d
dependencies:
  - issue_id: km-silvercode.shift-enter-newline
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:17:31Z
    created_by: claude:230fa25d
    metadata: "{}"
---

# [x] Shift+Enter inserts newline in command input (multi-line commands) @km/silvercode #feature #P2 @claude:230fa25d

blocks:: [[@km/silvercode]]

Currently plain Enter submits the command. Shift+Enter (and probably Alt+Enter) should insert a newline so users can compose multi-line commands in the input region without enqueuing.

Mechanism: silvery's TextArea + Kitty keyboard protocol distinguishes shift+enter from plain enter. Update apps/silvercode/src/components/CommandBox.tsx command-region TextArea: if the key event has shift or alt held with Enter, treat as newline insert; only plain Enter triggers onSubmit.

If TextArea doesn't expose a 'submit predicate' API, we may need to grow one in silvery (vendor/silvery/packages/ag-react/src/ui/components/TextArea.tsx) — submitKey already supports 'enter' and 'ctrl+enter'; consider adding the inverse 'shift-enter-is-newline' option, or accept submitKey as a function.

Reference: queue-region TextArea uses submitKey='ctrl+enter' so plain Enter inserts newline (the inverse of what command region needs).