---
id: "@km/silvery/scrollbar-flex-mode"
aliases:
  - km-silvery.scrollbar-flex-mode
  - km-silvery-scrollbar-flex-mode
created_by: claude:230fa25d
created_at: 2026-04-26T05:12:24Z
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

# [x] ListView scrollbar disabled in height-independent (flex) mode @km/silvery #bug #P2

blocks:: [[@km/silvery]]

When ListView is used without a height prop (flex-grown viewport), showScrollbar is gated off entirely:

  const showScrollbar = !isHeightIndependent && isScrolling && thumbHeight > 0 && thumbHeight < trackHeight

Comment at vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx:1914 says 'a future iteration could subscribe to layout-signals for a flex-aware scrollbar'. This bead is that iteration.

User-visible impact: silvercode's MessageList passes no height prop (flex propagation from parent), so the scrollbar never appears for any session — even when content overflows. Same for any silvery app using ListView in flex mode.

Approach:
1. In height-independent mode, read the inner Box's measured rect via useBoxRect(boxHandleRef) to get the live viewport height.
2. Use that measured height in place of the height prop when computing trackHeight, thumbHeight, thumbPos.
3. Remove the !isHeightIndependent gate from showScrollbar.
4. Test with a flex-mode ListView fixture (createRenderer pinning root width/height; ListView inside flexGrow=1 column).

Done when:
- Wheel scroll in flex-mode ListView renders the scrollbar at the right edge during activity, fades after SCROLLBAR_FADE_AFTER_MS.
- Thumb is sized proportionally to (viewport / total) and positioned correctly.
- Existing pinned-height tests still pass.
- New regression test in tests/features/ exercises flex-mode scrollbar.