---
mentions:
  - km
id: "@km/market/terminfo-completeness/xtwinops"
aliases:
  - km-market.terminfo-completeness.xtwinops
  - km-market-terminfo-completeness-xtwinops
created_by: Bjørn Stabell
created_at: 2026-04-06T06:07:52Z
closed_at: 2026-04-06T06:12:09Z
close_reason: consolidated into km-market.terminfo-completeness.query-protocols
owner: bjorn@stabell.org
---

# [x] Add XTWINOPS window operation probes (CSI t) @km/market #task #P2

Add xterm window manipulation probes. ~7-24 sub-operations under CSI t.

Query subset (safe, high-value):

- CSI 14 t — report window size in pixels
- CSI 16 t — report cell size in pixels
- CSI 18 t — report text area size in chars
- CSI 20 t — report icon label
- CSI 21 t — report window title
- CSI 22;0 t — push title/icon onto stack
- CSI 23;0 t — pop title/icon from stack

Action subset (dangerous, lower priority):

- CSI 11 t — report window state
- CSI 13 t — report window position
- CSI 3/4/8 t — move/resize
- CSI 9/10 t — maximize/fullscreen

Termless could implement title stack + query responses.
Real terminal probes verify actual behavior.

