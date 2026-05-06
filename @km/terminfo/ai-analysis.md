---
mentions:
  - km
  - claude
id: "@km/terminfo/ai-analysis"
aliases:
  - km-terminfo.ai-analysis
  - km-terminfo-ai-analysis
created_by: claude:f8196c1c
created_at: 2026-03-25T22:36:22Z
closed_at: 2026-03-25T22:50:48Z
close_reason: "Implemented: generate-analysis.ts (template-based, strict
  validation), 43 analysis entries across 5 page types (terminal, baseline,
  compare, category, standard), all templates wired with shared analysis.css,
  content/analysis.json generated and rendering. CLI: bun analysis / bun
  analysis:validate."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] AI-generated analysis commentary on terminal/baseline/compare/feature pages @km/terminfo #feature #P3 @claude:f8196c1c

AI-generated analysis commentary on terminal/baseline/compare/feature pages.

## Approach

Static content (description) + AI analysis (commentary with real numbers + changelog) merged together. Analysis references actual probe data and diffs between versions/runs.

## Data

- content/analysis.json — AI commentary + change summaries, keyed by page path
- History derived from git + versioned result files (no separate history dir)
- Generator reads ALL result files, groups by terminal, sorts by date, diffs adjacent pairs

## Analysis Generator (scripts/generate-analysis.ts)

Strict — throws on any inconsistency:

- Throws if a terminal in results has no entry in terminals.json
- Throws if feature IDs in results don't match features.json
- Throws if result values aren't yes/no/partial
- Throws if generated timestamps are missing or unparseable
- Throws if analysis text references numbers that don't match computed data

Pipeline: read all probe data → compute stats → diff versions → generate commentary via LLM → validate numbers in output → write analysis.json

## Pages

Render analysis inline (not a separate box). Styled as dated commentary below the static description. Changelog shown as a compact list of changes.

## /marketing workflow

enrich.md updated to include analysis generation. Detects stale analysis (probeHash mismatch) and regenerates.

