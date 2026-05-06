---
mentions:
  - km
  - claude
id: "@km/tui/zoom-render-artifacts"
aliases:
  - km-tui.zoom-render-artifacts
  - km-tui-zoom-render-artifacts
created_by: claude:d29abbfa
created_at: 2026-03-18T22:19:54Z
closed_at: 2026-03-19T17:31:12Z
close_reason: "Fixed: output-phase.ts dimension change guard — falls back to
  full render when buffer size changes. CUP clamping in replayAnsiWithStyles.
  Test: output-phase-dimension-change.test.ts (8 tests). Verified: TUI tests
  only — rendering pipeline fix."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] Rendering artifacts after deep zoom-out in Asana vault @km/tui #bug #P2 @claude:21c57d63

After zooming in deep (e.g., root → stabell → early-orbit → launch-academy → Phase 5) and then zooming out multiple levels back to root, the screen has rendering artifacts: (1) stray box-drawing characters on right edge (─, ╮, ╯, │), (2) remnant text from previous views ('e    a   D     D        L'), (3) right column only partially rendered (early-orbit card shows but rest of stabell column is blank), (4) stray 'e' character in breadcrumb. Likely an incremental rendering/dirty-rect issue where the output phase doesn't fully clear the previous frame's content when the board layout changes drastically during zoom-out. Repro: bun km view --repo imports/asana stabell/early-orbit/launch-academy, scroll right to Phase 5, then press Z four times to return to root.

