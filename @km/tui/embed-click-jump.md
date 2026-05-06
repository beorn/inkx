---
mentions:
  - km
  - Bjørn
id: "@km/tui/embed-click-jump"
aliases:
  - km-tui.embed-click-jump
  - km-tui-embed-click-jump
created_by: claude:ceb7c9cb
created_at: 2026-03-24T18:57:46Z
closed_at: 2026-04-06T20:47:32Z
close_reason: fixed in 3d2a9c2ec — click handler now routes through
  dispatchBoard SELECT with cardNodeId hint, so embed sub-item clicks resolve
  via the visual card not the symlink target. Regression test added in
  symlink.test.ts.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] fix: clicking embed sub-item causes column jump (embed cursor routing) @km/tui #bug #P2 @Bjørn Stabell

When clicking a sub-item inside an embed (\![[^blockref]]), the Family column jumps/scrolls briefly. Root cause: multiple code paths (deriveCursorAncestors, deriveCursorIndices, navigateVertical, ScrollTracker) independently walk the data model parent chain, which leads to the wrong card for embeds. Incremental fixes (click hint, cursorCardNodeId in NavState, deriveCursorIndices hint, cursor-store-first ordering) haven't fully resolved it — there may be additional render paths or timing issues. Needs a holistic approach: either make all parent-chain walks embed-aware, or add an embed-to-visual-card mapping at the repo/storage level.

