---
id: "@km/market/terminfo-completeness/dcs-queries"
aliases:
  - km-market.terminfo-completeness.dcs-queries
  - km-market-terminfo-completeness-dcs-queries
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:28Z
closed_at: 2026-04-06T06:12:10Z
close_reason: consolidated into km-market.terminfo-completeness.query-protocols
owner: bjorn@stabell.org
---

# [x] Add DCS query granularity (DECRQSS, XTGETTCAP split) @km/market #task #P2

Current DCS coverage is too coarse — "supports DECRQSS" is meaningless.

DECRQSS — split by target string:
- DECRQSS-SGR (DCS $ q m ST) — query current SGR
- DECRQSS-cursor-style (DECSCUSR target)
- DECRQSS-scroll-region (DECSTBM target)
- DECRQSS-margins (DECSLRM target)
- DECRQSS-protected-area

XTGETTCAP — split by capability name:
- XTGETTCAP-RGB (truecolor)
- XTGETTCAP-Tc
- XTGETTCAP-Ms (OSC 52)
- XTGETTCAP-Ss/Se (cursor style)
- XTGETTCAP-Cs/Cr (cursor color)
- XTGETTCAP-Setulc (underline color)
- XTGETTCAP-Smulx (styled underline)
- XTGETTCAP-Sync (sync output)
- XTGETTCAP-XM (mouse)
- XTGETTCAP-sitm/ritm (italic)

Rationale: many terminals implement DECRQSS/XTGETTCAP for some targets but not others.
Gives us a "terminfo advertisement vs reality" dataset.