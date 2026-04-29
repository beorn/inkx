---
id: "@km/market/terminfo-completeness/mode-splits"
aliases:
  - km-market.terminfo-completeness.mode-splits
  - km-market-terminfo-completeness-mode-splits
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:36Z
closed_at: 2026-04-06T06:12:10Z
close_reason: consolidated into km-market.terminfo-completeness.modes-columns
owner: bjorn@stabell.org
---

# [x] Add alt screen variants + mode splits @km/market #task #P2

Alt screen has 4 variants that should be probed separately:

- ?47 h/l — legacy alt screen (no cursor save)
- ?1047 h/l — alt screen, clear on enter
- ?1048 h/l — save/restore cursor only
- ?1049 h/l — alt screen + cursor save (current default)

Other mode gaps:
- ?1007 h/l — alt-scroll mode (mouse wheel in alt screen)
- ?1005 h/l — UTF-8 mouse mode (legacy between X10 and SGR)
- ?2005 h/l — quote-paste variant
- ?2006 h/l — literal-NL paste variant
- ?3 h/l — DECCOLM 80/132 column switch
- ?5 h/l — DECSCNM reverse video (already tracked)
- ?80 h/l — DECSDM sixel scrolling mode

Plus ANSI save/restore:
- CSI s — save cursor (distinct from DECSC ESC 7)
- CSI u — restore cursor (distinct from DECRC ESC 8)