---
id: "@km/market/terminfo-completeness/content-ci"
aliases:
  - km-market.terminfo-completeness.content-ci
  - km-market-terminfo-completeness-content-ci
created_by: Bjørn Stabell
created_at: 2026-04-06T03:58:54Z
owner: bjorn@stabell.org
---

# [ ] Content CI/CD system for terminfo.dev @km/market #task #P2

A 3-layer system for keeping terminfo.dev (and similar reference sites) continuously up-to-date.

Layer 1 — Manifest: declares upstream sources, features, terminal versions, freshness SLAs.
Layer 2 — Checker: diffs manifest vs reality, gap reports, creates issues. Already built: bun validate.
Layer 3 — Executor: scripts + LLMs for automated probing, content generation, human review.

Phases: manifest.ts (1-2h) → GitHub Action (30min) → LLM enrichment (2-3h) → upstream watchers (1-2h) → generalize (defer).

Related: @km/market/terminfo-completeness/osc-catalog (OSC completeness), @km/market/terminfo-completeness/runbook (runbook), /big analysis 2026-04-05.