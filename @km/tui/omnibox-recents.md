---
id: "@km/tui/omnibox-recents"
aliases:
  - km-tui.omnibox-recents
  - km-tui-omnibox-recents
created_by: Bjørn Stabell
created_at: 2026-04-14T23:37:23Z
closed_at: 2026-04-17T15:59:13Z
close_reason: "Shipped 2026-04-17 (merged commit e0349c358→agent-aa7e7f1c):
  in-memory recents store (recents-store.ts, 152 LOC), log-decay recencyBoost
  wired into rankResults/rankCommands, touched on CURSOR_TO/ZOOM_IN/EXECUTE. 19
  unit tests + 109 total omnibox tests pass. Persistence deferred to
  km-tui.recents-persist."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-recents
    depends_on_id: km-tui.omnibox-ranker
    type: blocks
    created_at: 2026-04-14T18:17:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-recents
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:37:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Recents/MRU plumbing — recency bonus + cursor pre-select source @km/tui #feature #P1

blocks:: [[@km/tui/omnibox-ranker]], [[@km/tui/omnibox-unified]]

MRU data source for the omnibox's empty-buffer behavior. Two flavors: (a) recent goto/pick targets stored per-node via lastVisitedAt signal; (b) recent commands stored per-command via lastRanAt signal. The ranker applies a recency bonus on top of text-match score so recents surface first when the buffer is empty AND get filtered down by the same match rules when the buffer is typed.

Current cursor of the previously-focused pane injects as selectedArgument at open time (this is the 'pre-select' v1 behavior — @km/tui/omnibox-pre-select bead covers the Phase 8 polish flag).

Acceptance:
(a) empty cmd-k shows (':' mode) recent commands with sticky cursor as selectedArgument
(b) empty cmd-f shows (no sigil) recent nodes with sticky cursor pre-selected
(c) recents filter by prefix (typing narrows the same list)
(d) test fixture table exercises (empty, partial, full match) crossed with (with-cursor, without-cursor)