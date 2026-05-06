---
mentions:
  - km
id: "@km/silvery/benchmarks"
aliases:
  - km-silvery.benchmarks
  - km-silvery-benchmarks
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:31:41Z
owner: bjorn@stabell.org
---

# [ ] Benchmark page: side-by-side Silvery vs Ink performance @km/silvery #task #P1

Benchmark page on silvery.dev — side-by-side Silvery vs Ink.

## Current state (2026-04-09)

Automated bench exists: vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
Results (M5 Max, 9 scenarios):

- Silvery wins 6/9: flat lists at scale (1.17-1.77x), styled (1.37x), kanban (1.08-1.40x), re-render (1.13x)
- Ink wins 3/9: small trees (1.07x), deep nesting 20-50 levels (1.65-1.94x — Yoga WASM per-node speed)

## Problem: docs/guide/silvery-vs-ink.md has stale numbers

- Claims "100x+ faster interactive updates" — not reproducible with apples-to-apples bench
- Claims "Silvery 1.6x faster cold render" for 1 component — Ink now wins small trees
- Old methodology used different render paths (Ink render() vs Silvery createRenderer). New bench uses renderToString for both.
- Page references mitata benchmarks that no longer exist

## What needs doing

1. Update silvery-vs-ink.md with reproducible numbers from the automated bench
2. Remove the "100x faster" claim — honest numbers are strong enough (1.4-1.8x at scale)
3. Acknowledge where Ink wins (deep nesting, small trees)
4. Link to the reproducible bench: bun vitest bench vendor/internal/silvery/benchmarks/
5. Keep the "understanding the rerender row" caveat but with honest numbers

