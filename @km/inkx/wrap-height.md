---
id: "@km/inkx/wrap-height"
aliases:
  - km-inkx.wrap-height
  - km-inkx-wrap-height
created_by: claude:23485adf
created_at: 2026-02-23T22:27:42Z
closed_at: 2026-02-23T23:28:57Z
---

# [x] wrap=wrap text in bordered card doesn't expand height — text bleeds into border @km/inkx #bug #P2

7 pre-existing test failures in rerender-virtuallist.test.tsx (5) and rerender-memo.test.tsx (2). All fail on INITIAL render — text with wrap=wrap inside a bordered card doesn't properly expand the card height, causing text to bleed into the bottom border characters. Reproduced at committed HEAD (not caused by Phase 1-3 perf changes). The rendered output shows wrapped text overlapping the border row. This is a Flexx/Yoga layout calculation bug where the measured text height doesn't account for wrapping when computing the parent's height.