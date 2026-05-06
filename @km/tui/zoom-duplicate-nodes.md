---
mentions:
  - km
  - Bjørn
id: "@km/tui/zoom-duplicate-nodes"
aliases:
  - km-tui.zoom-duplicate-nodes
  - km-tui-zoom-duplicate-nodes
created_by: Bjørn Stabell
created_at: 2026-04-06T20:03:02Z
closed_at: 2026-04-06T20:48:12Z
close_reason: "partial: could not reproduce on synthetic fixtures. Added 2
  regression test guards in board-zoom.slow.spec.ts (commit 91ee00755) covering
  paragraph and folder vault shapes — both currently pass, so the bug must
  require something specific to the user's vault. 5 Whys analysis and possible
  root causes documented in notes. Will reopen with vault data when the user can
  share the exact structure that triggers duplication."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Zoom out shows duplicated nodes (Design phase appears twice) @km/tui #bug #P2 @Bjørn Stabell

Repro: zoom into Projects → zoom into Alpha project → zoom back out. Child node appears both as standalone card AND as child of its parent. Tree rendering issue after zoom-out cursor preservation.

