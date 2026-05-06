---
mentions:
  - km
id: "@km/market/terminfo-completeness/state-stacks"
aliases:
  - km-market.terminfo-completeness.state-stacks
  - km-market-terminfo-completeness-state-stacks
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:11Z
closed_at: 2026-04-06T06:12:09Z
close_reason: consolidated into km-market.terminfo-completeness.query-protocols
owner: bjorn@stabell.org
---

# [x] Add xterm state stacks (XTPUSHSGR, XTSAVE, color stack) @km/market #task #P2

State stack management from xterm.

SGR stack:

- XTPUSHSGR — CSI # { — push current SGR
- XTPOPSGR — CSI # } — pop SGR
- XTREPORTSGR — CSI # ? (if exists)

Mode stack (DEC private modes):

- XTSAVE — CSI ? Pm s — save DEC private modes
- XTRESTORE — CSI ? Pm r — restore DEC private modes

Color palette stack:

- CSI # P — push palette
- CSI # Q — pop palette
- CSI # R — report palette

Support: xterm-origin, adopted by mintty, foot, WezTerm, Ghostty (varies).
Termless should track state stacks as part of terminal state.

