---
mentions:
  - km
  - claude
id: "@km/silvercode/user-message-wrap"
aliases:
  - km-silvercode.user-message-wrap
  - km-silvercode-user-message-wrap
created_by: claude:230fa25d
created_at: 2026-04-26T05:17:21Z
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
started_at: 2026-04-26T05:20:29Z
owner: bjorn@stabell.org
assignee: claude:230fa25d
dependencies:
  - issue_id: km-silvercode.user-message-wrap
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:17:24Z
    created_by: claude:230fa25d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] User messages overflow horizontally instead of soft-wrapping @km/silvercode #bug #P2 @claude:230fa25d

blocks:: [[@km/silvercode]]

Repro: paste or type a long single-line message in CommandBox, submit. The user-message row in MessageList renders as a single horizontally-overflowing line that gets clipped at the viewport's right edge instead of soft-wrapping.

Files: apps/silvercode/src/components/UserMessageBlock.tsx (the row container), apps/silvercode/src/components/DetectionText.tsx (the text renderer with wrap=wrap).

Hypothesis: the outer Box flexDirection=row + Prose flexGrow=1 chain isn't propagating an upper width bound to DetectionText's wrap=wrap Text nodes. May need flexShrink/minWidth=0 on the row, or the parent (MessageItem in MessageList) isn't constraining width. CommandBox's queue TextArea has the same overflow issue — also worth checking.

