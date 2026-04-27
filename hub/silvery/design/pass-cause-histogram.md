# Pass-Cause Histogram (C3a baseline capture)

Captured 2026-04-26 from the renderer-feedback-trace instrumentation
landed on `feat/feedback-trace`. Source data: vendor + km-tui suites
run with `SILVERY_INSTRUMENT=1`.

- Vendor: 511 test files, 11 367 tests passed → 723 app teardowns recorded
- km-tui: 126 test files, 2 534 tests passed → 6 app teardowns recorded

Combined: **729 app teardowns, 191 897 extra-pass causes**.

## Captured pass-cause categories

| Category | Count | % |
|---|---:|---:|
| layout-invalidate | 191 585 | 99.8% |
| scrollto-settle | 312 | 0.2% |
| text-measurement-feedback | 0 | 0.0% |
| viewport-dependent | 0 | 0.0% |
| resize-resettle | 0 | 0.0% |
| unknown | 0 | 0.0% |

## Per-pass-index commits

| Pass index | Commits |
|---:|---:|
| 0 | 83 |

Reading: across all observed convergence loops, only pass-index 0 ever
committed React work that forced a pass-1. No test reached pass-2 or
beyond. Convergence loops in the surveyed corpus stabilize in **at most
2 passes**.

## Top edges (signal / prop)

### layout-invalidate

| Edge | Count |
|---|---:|
| `scrollRect` | 72 112 |
| `screenRect` | 72 112 |
| `boxRect` | 47 361 |

These are the three rect signals synced by `notifyLayoutSubscribers` →
`syncRectSignals` after every layout phase. The 1:1 ratio between
`scrollRect` and `screenRect` is structural — `screenRect` is computed
from `scrollRect` plus ancestor scroll offsets, so they invalidate
together. `boxRect` lags slightly because it only changes on geometry
(width/height) shifts, not pure scroll-offset changes.

### scrollto-settle

| Edge | Count |
|---|---:|
| `scrollTo:newIntent` | 311 |
| `scrollTo:recovery` | 1 |

Almost all scrollTo activity is "new intent" (cursor moved to a target).
"recovery" — the same-intent re-fire that catches the
contentHeight-grew-mid-pass case — fired exactly once across the entire
corpus. That's the existing `targetCompletelyOffscreen` guard doing its
job; it's a rare edge case, not a hot path.

## Top nodes

### layout-invalidate

| Node identity | Count |
|---|---:|
| `silvery-text` | 136 353 |
| `silvery-box` | 46 420 |
| `silvery-root` | 3 420 |
| `silvery-box#bottom-bar` | 78 |
| `silvery-box#main` | 69 |
| `silvery-box#board` | 69 |
| `silvery-box#top-bar` | 69 |
| `silvery-text#view-mode` | 69 |
| `silvery-text#storage-path` | 24 |
| `silvery-text#node-count` | 12 |
| `silvery-text#watcher-loading` | 12 |
| `silvery-text#watcher-status` | 12 |

km-tui's named regions (bottom-bar, main, board, top-bar, view-mode,
storage-path, etc.) appear because we extract `props.testid / id / name
/ nodeId` for identity. Most invalidates are anonymous text/box nodes
inside lists and rows — those would benefit from `name` props if we
wanted finer-grained attribution.

## Dominant pass-cause categories — input for C3b

For C3b (bounded-convergence) the takeaway is:

1. **layout-invalidate dominates by 3-orders-of-magnitude** (99.8%) —
   any structural bound on convergence must be expressed in terms of
   layout-invalidate edges first. The current convergence loop's job is
   to drain layout-invalidate cascades.
2. **The cascade is shallow.** Across 729 app teardowns, only pass 0
   ever committed React work. The MAX_SINGLE_PASS_ITERATIONS=15 budget
   was a precaution; observed depth is 1. C3b can almost certainly
   replace the budget with "1 extra pass for layout-invalidate, error
   beyond" without breaking the corpus.
3. **scrollto-settle is structurally bounded already** — 311 newIntent
   firings produced 0 follow-on passes. The `targetCompletelyOffscreen`
   recovery edge fired once and also stabilized in a single follow-up.
   Recommend: scrollto-settle stays at most 1 extra pass.
4. **No text-measurement-feedback / resize-resettle / viewport-dependent
   records were emitted.** This is partly because their emit points
   were not yet wired (only layout-invalidate + scrollto-settle land in
   this baseline), but also reflects that the test corpus does not
   currently exercise resize during a single render cycle. C3b should
   wire these emit points before relying on their absence.

## Reproducing

```bash
# Vendor suite
: > /tmp/silvery-pass-histogram-vendor.jsonl
SILVERY_INSTRUMENT=1 \
  SILVERY_INSTRUMENT_FILE=/tmp/silvery-pass-histogram-vendor.jsonl \
  bun vitest run --project=vendor

# km-tui suite
: > /tmp/silvery-pass-histogram-kmtui.jsonl
SILVERY_INSTRUMENT=1 \
  SILVERY_INSTRUMENT_FILE=/tmp/silvery-pass-histogram-kmtui.jsonl \
  bun vitest run apps/km-tui/tests/

# Aggregate
bun tools/aggregate-pass-histogram.ts \
  /tmp/silvery-pass-histogram-vendor.jsonl \
  /tmp/silvery-pass-histogram-kmtui.jsonl
```

The instrumentation lives at
`vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts` and is wired
into the convergence loops in `renderer.ts` + `runtime/create-app.tsx`,
plus the layout-invalidate / scrollto-settle emit points in
`pipeline/layout-phase.ts`. Default behaviour
(`SILVERY_INSTRUMENT` unset) is unchanged.

## Tracking

- `km-silvery.renderer-feedback-trace` (this work, C3a)
- `km-silvery.renderer-convergence-by-design` / C3b (consumes this data)
- `km-silvery.structural-hardening` (parent epic)
