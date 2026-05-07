---
mentions:
  - km
  - Bjørn
id: "@km/vterm/feature-gap-implementation"
aliases:
  - km-vterm.feature-gap-implementation
  - km-vterm-feature-gap-implementation
created_by: Bjørn Stabell
created_at: 2026-04-18T04:45:57Z
closed_at: 2026-04-18T05:04:05Z
close_reason: All 35 missing vterm features implemented faithfully. 43 new unit
  tests + 233 terminfo.dev probe tests passing. vterm now at 100% terminfo.dev
  coverage (zero false entries).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Implement all missing vterm features (OSC colors, tab stops, rect edits, XTWINOPS, etc.) @km/vterm #feature #P1 @Bjørn Stabell

Implement every feature failing for vterm in terminfo.dev probes: OSC 4/5/12/17/19/21/104/112 color management, OSC 10/11 set side, HPA, HTS/TBC/CHT/CBT tab stops, DECALN, rectangular edit ops (DECFRA/DECERA/DECSERA/DECCRA/DECCARA/DECRARA/DECRQCRA), SL/SR/DECIC/DECDC column ops, XTWINOPS 14/16/18/20/21, DECCOLM, altscreen-1048, alt-scroll-1007, utf8-mouse-1005.

