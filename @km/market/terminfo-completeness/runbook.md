---
mentions:
  - km
id: "@km/market/terminfo-completeness/runbook"
aliases:
  - km-market.terminfo-completeness.runbook
  - km-market-terminfo-completeness-runbook
created_by: Bjørn Stabell
created_at: 2026-04-06T03:50:20Z
closed_at: 2026-04-06T07:02:36Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
owner: bjorn@stabell.org
---

# [x] terminfo.dev runbook + validation command @km/market #task #P2

Create a runbook and automated validation for terminfo.dev content lifecycle.

1. bun terminfo validate — checks tag consistency, empty pages, missing fields, sitemap dupes, probe parity
2. RUNBOOK.md — full rebuild + periodic refresh workflows
3. Consider making validate run as part of the build (fail on errors, warn on gaps)

Related: @km/market/terminfo-completeness/osc-catalog (OSC completeness), tag taxonomy cleanup (3cdaf4d)

