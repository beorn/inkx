---
id: "@km/market/terminfo-completeness/modes-columns"
aliases:
  - km-market.terminfo-completeness.modes-columns
  - km-market-terminfo-completeness-modes-columns
created_by: Bjørn Stabell
created_at: 2026-04-06T06:11:55Z
closed_at: 2026-04-06T07:02:34Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Mode splits + column editing (buffer model gaps) @km/market #task #P2 @Bjørn Stabell

Consolidates: mode-splits + column-edit

## Why together
Both are buffer/mode operations that need termless buffer model changes.
Alt screen variants, DECCOLM, SL/SR, DECIC/DECDC all manipulate buffer state
at a level deeper than simple cell writes.

## Alt screen variants (split the current ?1049 tracking)
- ?47 h/l — legacy alt screen (no cursor save)
- ?1047 h/l — alt screen, clear on enter
- ?1048 h/l — save/restore cursor only
- ?1049 h/l — alt screen + cursor save (already tracked)

## Other mode gaps
- ?1007 h/l — alt-scroll mode (mouse wheel in alt screen)
- ?1005 h/l — UTF-8 mouse mode (legacy)
- ?2005/2006 h/l — paste variants
- ?3 h/l — DECCOLM 80/132 column switch
- ?80 h/l — DECSDM sixel scrolling mode

## ANSI save/restore cursor
- CSI s / CSI u — distinct from DECSC/DECRC

## Column editing (horizontal operations)
- SL — CSI Ps SP @ — shift left
- SR — CSI Ps SP A — shift right
- DECIC — CSI Ps ' } — insert columns
- DECDC — CSI Ps ' ~ — delete columns

Termless would need column-level operations in buffer model (currently row-oriented).