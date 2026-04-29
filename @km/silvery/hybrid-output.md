---
id: "@km/silvery/hybrid-output"
aliases:
  - km-silvery.hybrid-output
  - km-silvery-hybrid-output
created_by: Bjørn Stabell
created_at: 2026-04-09T14:31:04Z
closed_at: 2026-04-09T23:58:18Z
---

# [x] Hybrid output emission — spans + rows + cells (Pro's #1 recommendation) @km/silvery #task #P1 @Bjørn Stabell

The strategic Tier 2 optimization. Keep silvery's cell-level dirty tracking but emit smarter: coalesce contiguous dirty cells into runs, emit whole rows when dirty density is high.

## Impact
- Helps cold renders (emit full sequential rows)
- Helps simple updates (run-length encoding)
- Helps style-heavy rows (fewer cursor positioning sequences)
- PRESERVES the kanban 3.73x win
- This is Pro's #1 recommendation as the strategic optimization

## Root cause
Current output-phase emits cells individually or in per-line chunks. When many contiguous cells in a row are dirty, each one gets its own cursor positioning + cell data, bloating the output.

## Fix
In output-phase.ts, after collecting dirty cells, analyze density:
- If row has >50% dirty cells: emit whole row
- If row has contiguous dirty runs: emit run-length chunks (cursor to start, then contiguous cell data)
- If row has isolated scattered cells: current per-cell emission (preserves kanban efficiency)

Decision happens per-row based on dirty density.

## Effort
~3-5 days. Substantial change to output-phase.ts. Needs extensive testing with SILVERY_STRICT to verify no visual regressions.

## Code locations
- vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts — main logic
- vendor/silvery/packages/ag-term/src/buffer.ts — buffer diff internals

## Verification
- SILVERY_STRICT=1 on ALL @km/tui tests — must pass cell-by-cell
- bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
- Expected: kanban win maintained (>3x still)
- Expected: flat list cold scenarios improve (5-15%)
- Expected: simple cursor move scenarios tie or silvery wins

## NOTE
This is Tier 2 — only tackle after Tier 1 (Phase 7a, useState bench, doRender overhead, renderer reuse) lands.