---
mentions:
  - km
  - claude
id: "@km/silvercode/tool-call-spacing"
aliases:
  - km-silvercode.tool-call-spacing
  - km-silvercode-tool-call-spacing
created_by: claude:230fa25d
created_at: 2026-04-26T05:17:27Z
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
  - issue_id: km-silvercode.tool-call-spacing
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:17:27Z
    created_by: claude:230fa25d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Inconsistent blank line + icon spacing before tool calls in assistant messages @km/silvercode #bug #P3 @claude:230fa25d

blocks:: [[@km/silvercode]]

Two related visual inconsistencies in the assistant message stream:

1. Sometimes there's a blank line before the first tool call after assistant text, sometimes there isn't. Should always have one for visual breathing room.
2. Sometimes there's a space between the tool icon and the tool name, sometimes not. Should always have a space.

Files: apps/silvercode/src/components/MessageList.tsx (MessageItem layout), apps/silvercode/src/components/ToolCallBlock.tsx (icon + name composition).

Done when: every assistant→toolCall transition has a leading blank line and every tool icon has a trailing space before the name.

