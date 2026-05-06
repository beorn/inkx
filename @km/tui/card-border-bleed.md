---
mentions:
  - km
id: "@km/tui/card-border-bleed"
aliases:
  - km-tui.card-border-bleed
  - km-tui-card-border-bleed
created_by: claude:fcaad2fa
created_at: 2026-02-18T16:27:25Z
closed_at: 2026-02-18T23:40:29Z
owner: bjorn@stabell.org
---

# [x] inkx: text bleeds into right border of Box with borderStyle @km/tui #bug #P2

Date text (e.g. 'Sep 30') bleeds into the right border of card Box. Screenshot: Desktop/Screenshot 2026-02-18 at 16.25.56.png. Known inkx bug — text overflow into right border with borderStyle. Currently worked around with paddingRight={1} in CardColumn.tsx. Root fix should be in vendor/beorn-inkx/. Related: @km/tui/detail-border-black (spaces in middle of borders).

