---
id: "@km/market/terminfo-completeness"
aliases:
  - km-market.terminfo-completeness
  - km-market-terminfo-completeness
created_by: Bjørn Stabell
created_at: 2026-04-06T04:09:04Z
closed_at: 2026-04-26T06:24:17Z
close_reason: All children completed
owner: bjorn@stabell.org
---

# [x] terminfo.dev content completeness + CI/CD @km/market #epic #P2

Tracking epic for making terminfo.dev the definitive terminal feature reference.

## Delivered (2026-04-05 session)
- Tag taxonomy cleanup: merged duplicate tags, added missing OSC tags (3cdaf4d)
- OSC page: sorted by number, sources section with internal links
- New standard pages: iTerm2 Extensions, ConEmu Extensions, VS Code Extensions
- Duplicate /unicode sitemap fix
- bun validate script (structural + semantic checks)
- RUNBOOK.md (full rebuild + periodic refresh + retrospective)
- Research: 80+ OSC numbers mapped, 27 terminal standard sources catalogued

## Child beads
- @km/market/terminfo-completeness/osc-catalog: Add all missing OSC sequences (~60 to add across 17 sources)
- @km/market/terminfo-completeness/runbook: Runbook + validation command (partially done — validate script shipped)
- @km/market/terminfo-completeness/content-ci: Content CI/CD system (manifest + evidence tracking + weekly CI)

## Vision
An evidence-tracking and drift-detection system (per GPT 5.4 Pro review):
1. Manifest (sitefile.ts) — declares sources, versions, SLAs
2. Acquisition — normalized evidence records with provenance
3. Resolver/Policy — staleness rules, conflict resolution
4. Review/Workflow — rolling weekly issue
5. Publish — VitePress as pure rendering layer

## Coverage targets
- xterm ctlseqs: 74/203 features tracked (36%) → 80%+
- OSC: 21/80+ tracked → comprehensive
- Terminal probes: 14/20 with data → all active terminals current
- Annotation coverage: 74.8% → 90%+