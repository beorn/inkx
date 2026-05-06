---
mentions:
  - km
id: "@km/market/terminfo-completeness/column-edit"
aliases:
  - km-market.terminfo-completeness.column-edit
  - km-market-terminfo-completeness-column-edit
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:14Z
closed_at: 2026-04-06T06:12:11Z
close_reason: consolidated into km-market.terminfo-completeness.modes-columns
owner: bjorn@stabell.org
---

# [x] Add column editing + horizontal scroll (SL, SR, DECIC, DECDC) @km/market #task #P2

Column-level editing operations. ~4 features.

- SL — CSI Ps SP @ — shift left (horizontal scroll)
- SR — CSI Ps SP A — shift right (horizontal scroll)
- DECIC — CSI Ps ' } — insert columns
- DECDC — CSI Ps ' ~ — delete columns

Support: xterm, mintty; partial in modern VT-rich emulators.

Termless would need to implement these in the buffer model (currently row-oriented).

