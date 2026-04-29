---
id: "@km/silvercode/ctrl-d-scrolls-to-top"
aliases:
  - km-silvercode.ctrl-d-scrolls-to-top
  - km-silvercode-ctrl-d-scrolls-to-top
created_by: claude:2405c72e
created_at: 2026-04-26T15:38:32Z
closed_at: 2026-04-26T15:39:11Z
close_reason: Shipped. Dropped nav from MessageList — silvery's ListView nav
  useInput was consuming Ctrl+D as vim half-page-down (ListView.tsx:1189).
  silvercode has no item-selection on chat. App-level Shift+arrow scroll
  bindings remain canonical.
started_at: 2026-04-26T15:38:37Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.ctrl-d-scrolls-to-top
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T08:38:36Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Ctrl+D scrolls MessageList to top instead of arming exit chord @km/silvercode #bug #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Pressing Ctrl+D in silvercode jumps the MessageList viewport to the top (or near-top), instead of just arming the Ctrl+D×2 exit chord silently. Repro: silvercode --resume <id>; viewport at bottom (follow=end); press Ctrl+D once; viewport jumps to top. Root cause: ListView in MessageList had nav={true} which registers a useInput consuming Ctrl+D as vim half-page-down (ListView.tsx:1189: moveTo(cur+pageStep)). MessageList passes no cursorKey (silvercode has no item-selection on chat), so activeCursor defaults to 0. Ctrl+D fires moveTo(0+pageStep), then the cursor-follow scrollTo priority drives viewport to that small index → user sees scroll-to-top. Fix: drop nav from MessageList — silvercode never wanted item-selection, and App-level Shift+Up/Down/PageUp/PageDown is the canonical scroll surface (it calls scrollBy/scrollToTop/scrollToBottom imperatively, not via cursor).