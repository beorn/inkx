---
id: "@km/terminfo/vterm-declrmm"
aliases:
  - km-terminfo.vterm-declrmm
  - km-terminfo-vterm-declrmm
created_by: claude:4929065a
created_at: 2026-03-26T08:14:46Z
closed_at: 2026-03-31T17:24:16Z
close_reason: "Implemented all 4 remaining features: DECLRMM (real left/right
  margin support), mode 2031 (color scheme reporting), OSC 66 (text sizing), OSC
  5522 (advanced clipboard). vterm.js now 161/161 (100%) on terminfo.dev. 26 new
  tests, all passing."
---

# [x] vterm.js: implement DECLRMM (left/right margins) — last missing feature for 100% @km/terminfo #feature #P3 @claude:4929065a

vterm.js scores 146/147 (99%) on terminfo.dev. The sole remaining failure is modes.left-right-margin (DECSET ?69 / DECLRMM).

Implementing DECLRMM requires:
- Track left/right margin state (DECSLRM CSI s with two params when DECLRMM enabled)
- Constrain cursor movement to margin columns
- Constrain erase operations to margin area
- Constrain line insert/delete to margin area
- Scroll only within margin columns

This is medium complexity — margins affect write, erase, scroll, and cursor operations throughout screen.ts. Worth doing for the 100% badge but not urgent.