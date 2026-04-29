---
id: "@km/inkx/scroll-oscillation"
aliases:
  - km-inkx.scroll-oscillation
  - km-inkx-scroll-oscillation
created_by: claude:36393b5d
created_at: 2026-02-18T23:45:16Z
closed_at: 2026-02-18T23:45:16Z
owner: bjorn@stabell.org
---

# [x] inkx: scroll oscillation when viewport fits 1 item causes infinite loop @km/inkx #bug #P1

calcEdgeBasedScrollOffset in vendor/beorn-inkx/src/scroll-utils.ts had a scroll oscillation bug. When viewport fits only 1 column (detail pane narrows board to ~48 cols), the small-viewport special case would: (1) offset=0, scrollTo=1: scroll forward to offset=1, (2) offset=1, scrollTo=1: scroll BACK to offset=0 (special case), creating infinite oscillation. Inside React act(), this causes infinite setScrollOffset state updates that never converge. Fix: added 'visibleCount > padding' guard. Tests: 4 regression tests in detail-pane-nav-hang.test.ts. Also unblocked board-features.spec.ts which was completely hanging.