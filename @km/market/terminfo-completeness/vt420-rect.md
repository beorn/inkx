---
id: "@km/market/terminfo-completeness/vt420-rect"
aliases:
  - km-market.terminfo-completeness.vt420-rect
  - km-market-terminfo-completeness-vt420-rect
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:05Z
closed_at: 2026-04-06T07:02:36Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
---

# [x] Add VT420 rectangular area operations @km/market #task #P3 @Bjørn Stabell

DEC VT420 rectangular area operations. ~8 features. Historical but xterm/mintty implement them.

- DECFRA — CSI Pc;Pt;Pl;Pb;Pr $ x — fill rectangular area
- DECERA — CSI Pt;Pl;Pb;Pr $ z — erase rectangular area
- DECSERA — CSI Pt;Pl;Pb;Pr $ { — selective erase rectangular area
- DECCRA — CSI Pts;Pls;Pbs;Prs;Pps;Ptd;Pld $ v — copy rectangular area
- DECCARA — change attrs in rectangular area
- DECRARA — reverse attrs in rectangular area
- DECSACE — CSI Ps * x — select attribute-change extent
- DECRQCRA — checksum rectangular area

Support: definitely xterm, mintty; some VT-rich emulators partial.
Low priority (historical) but a complete blind spot.