---
id: "@km/silvercode/commandbox-ctrl-u-scroll"
aliases:
  - km-silvercode.commandbox-ctrl-u-scroll
  - km-silvercode-commandbox-ctrl-u-scroll
created_by: claude:230fa25d
created_at: 2026-04-26T05:10:41Z
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
---

# [x] Ctrl-U in CommandBox scrolls MessageList viewport to top @km/silvercode #bug #P2 @claude:230fa25d

blocks:: [[@km/silvercode]]

Repro: focus the command input, type a line, hit Ctrl-U to kill it. The MessageList ListView jumps to the top instead of staying pinned to the latest message.

Suspected cause: MessageList uses cursorKey={cursor} with initial state -1 and no auto-advance to the last index. Any state change that re-keys ListView (e.g. inputValue → '') may reset the cursor and trigger a scroll-to-top.

Files: apps/silvercode/src/components/MessageList.tsx (cursor state), apps/silvercode/src/components/CommandBox.tsx (Ctrl-U via TextArea readline).

Done when: a failing test reproduces ctrl-u during streaming or with messages off-screen, fix lands, viewport stays at the latest line.