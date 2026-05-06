---
mentions:
  - km
  - Bjørn
id: "@km/silvery/perf-deep-dive"
aliases:
  - km-silvery.perf-deep-dive
  - km-silvery-perf-deep-dive
created_by: Bjørn Stabell
created_at: 2026-04-09T07:43:58Z
closed_at: 2026-04-09T07:57:30Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Deep dive: silvery vs ink architectural perf differences @km/silvery #task #P0 @Bjørn Stabell

Spend at least 1 hour analyzing the architectural differences between silvery and ink that explain the bench results, and produce concrete optimization opportunities.

## Process (iterate 5 times)

1. Use /big to generate hypotheses about where silvery's bottlenecks are
2. Use /pro to get GPT 5.4 Pro's analysis of specific code sections
3. Profile the actual hotspots with SILVERY_INSTRUMENT
4. Compare with Ink's render path (read their source)
5. Synthesize findings into concrete optimization opportunities

## Iterations

- Round 1: Pipeline overview + hypotheses
- Round 2: Cold render init analysis (the 1.15x small-tree loss)
- Round 3: Deep tree layout analysis (the 2.4x deep tree loss)
- Round 4: 1000-item re-render analysis (React reconciliation bottleneck)
- Round 5: Synthesis + prioritized action plan

## Output

- Detailed analysis in vendor/internal/silvery/internals/perf-analysis-2026-04.md
- 3-5 concrete optimization opportunities with effort estimates
- Code locations for each opportunity
- Priority order based on bench impact

