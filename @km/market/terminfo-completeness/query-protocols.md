---
id: "@km/market/terminfo-completeness/query-protocols"
aliases:
  - km-market.terminfo-completeness.query-protocols
  - km-market-terminfo-completeness-query-protocols
created_by: Bjørn Stabell
created_at: 2026-04-06T06:11:42Z
closed_at: 2026-04-06T07:02:35Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
---

# [x] Query protocols: window ops + state stacks + DCS granularity @km/market #task #P2 @Bjørn Stabell

Consolidates: xtwinops + state-stacks + dcs-queries

## Why together
All three are query-response protocols where the terminal reports state back.
They share the same probe infrastructure (feedCapture/queryWithSentinel) and
require termless to implement query response generation for headless verification.

## XTWINOPS query subset (safe, high-value)
- CSI 14 t — window size in pixels
- CSI 16 t — cell size in pixels
- CSI 18 t — text area size in chars
- CSI 20 t — icon label
- CSI 21 t — window title
- CSI 22;0 t / 23;0 t — push/pop title stack

## State stacks
- XTPUSHSGR (CSI # {) / XTPOPSGR (CSI # })
- XTSAVE (CSI ? Pm s) / XTRESTORE (CSI ? Pm r) — DEC private modes
- Color palette stack (CSI # P / Q / R)

## DCS query granularity
### DECRQSS — split by target
- query SGR (DCS $ q m ST)
- query DECSCUSR cursor style
- query DECSTBM scroll region
- query DECSLRM margins
- query protected area

### XTGETTCAP — split by capname
- RGB, Tc (truecolor)
- Ms (OSC 52)
- Ss, Se (cursor style)
- Cs, Cr (cursor color)
- Setulc (underline color)
- Smulx (styled underline)
- Sync (sync output)
- XM (mouse)
- sitm, ritm (italic)

Shared work: termless needs to generate proper query responses; features.json needs
granular entries for each target.