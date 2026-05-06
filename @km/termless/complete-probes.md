---
mentions:
  - km
  - claude
id: "@km/termless/complete-probes"
aliases:
  - km-termless.complete-probes
  - km-termless-complete-probes
created_by: claude:4929065a
created_at: 2026-03-24T14:49:12Z
closed_at: 2026-03-24T19:04:44Z
close_reason: 106 features across 11 categories with body content, slugs, spec
  URLs. 45 real-terminal probes in terminfo CLI.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Systematically review all terminal standards and implement probes for all features @km/termless #task #P1 @claude:4929065a

Audit all terminal standards (ECMA-48, VT100/VT510, xterm ctlseqs, Kitty extensions, OSC) and implement census probes for every feature. Current coverage: ~62 features. Goal: comprehensive coverage of all commonly-used escape sequences.

Phase 1: Audit standards, identify missing features
Phase 2: Add features to features.json with slugs, spec URLs, tags
Phase 3: Implement probes in terminfo.dev/probes/
Phase 4: Run census, annotate failures
Phase 5: Ensure all pages have canonical spec links

