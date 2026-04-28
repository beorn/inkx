# Pass-Cause Histogram (C3a baseline capture, v3 — loggily-routed, v3.1 — checklist polish)

Captured 2026-04-26 from the renderer-feedback-trace instrumentation
on `feat/feedback-trace`. Two corpora measured side by side: silvery's
own feature suite (small, stable, high-coverage of the framework) and
km-tui's full app suite (real-world layouts, large boards, named regions).

## Revision history

- **v1** (initial): emit on every rect-signal sync. Result: 99.83%
  layout-invalidate dominance — bookkeeping noise that buried every
  other category.
- **v2** (post dual-pro review by GPT-5.4 + Kimi K2.6):
  - Split enum: added `wrap-reflow`, `intrinsic-shrinkwrap`,
    `font-metrics-changed`, `sticky-resettle`, `decoration-remap`,
    `focus-scroll-into-view`, `async-image-size`, `theme-metric-changed`,
    `viewport-resize`. Kept `viewport-dependent` and
    `text-measurement-feedback` for back-compat.
  - **Gated `layout-invalidate` to subscriber-observed nodes only**
    (`hasLayoutSignals(node)`). Unobserved rect changes are no longer
    counted — they're bookkeeping volume, not feedback edges.
  - Added `producerPhase` field to records (measure / layout / scroll /
    sticky / scrollrect / decoration / content / output / renderer /
    react-effect) so C3b can attribute by phase too.
  - Wired emit points in:
    - `runtime/renderer.ts` — viewport-resize on dimension change
    - `pipeline/measure-phase.ts` — intrinsic-shrinkwrap on
      width/height delta after `setMaxWidth`/`setHeight`
    - `pipeline/layout-phase.ts` — sticky-resettle on stickyChildren
      change
- Total record count dropped 191 824 → 16 466 (40× reduction in noise).
  The subscriber-observed layout-invalidate count is what C3b needs.
- **v3** (this version, post second dual-pro review on the loggily integration):
  - Recast emission on top of `loggily` (the project's structured-logging
    primitive). Pass-causes are now emitted as `passLog.debug?.("pass", record)`
    under the `silvery:passes` namespace.
  - Aggregation moved into a custom loggily pipeline `Stage` (instead of
    a parallel ad-hoc aggregator). The stage filters
    `event.kind === "log" && event.namespace === "silvery:passes" &&
    event.message === "pass"` and captures `event.props` into the
    categorical store.
  - **Spans are NOT used.** Both /pro reviewers (GPT-5.4 Pro + Kimi K2.6)
    confirmed that pass-causes are instantaneous categorical events, not
    timed work — `log.span()` would record spurious 0 ms entries that
    pollute traces. `loggily/metrics` (the duration histogram) is
    intentionally duration-only and not extended.
  - Default-off via the existing `SILVERY_INSTRUMENT=1` env (silvery-side
    hot-path gate). The loggily side composes: `DEBUG=silvery:passes`
    can be used to also pipe the events to console for live debugging.
  - Tests can attach their own aggregator via
    `createPassCauseAggregator()` and pass `aggregator.stage` into a
    fresh `createLogger("silvery:passes", [{ level: "debug" }, stage])`.
    The module-singleton aggregator (`getPassAggregator()`) is what
    production and the vitest setup use.
  - Public API is unchanged. `recordPassCause`, `beginPass`,
    `notePassCommit`, `getPassHistogram`, `formatPassHistogram`,
    `printPassHistogram`, `appendHistogramJson`, `resetPassHistogram`
    keep their pre-v3 signatures; their bodies now route through loggily.
    New exports: `getPassAggregator`, `createPassCauseAggregator`, and
    the `PassCauseAggregator` / `ProducerPhase` types.
- **v3.1** (checklist polish, 2026-04-27):
  - Renamed `recordPassCause` → `logPass` at all 9 call sites in
    renderer.ts / pipeline/{layout,measure}-phase.ts /
    runtime/{renderer,create-app}.tsx — the new name reflects the
    loggily-native shape (`logPass({ cause, ... })` is a thin wrapper
    over `passLog.debug?.("pass", { cause, ... })`).
  - Added per-cause child namespaces. Pass-causes now emit on
    `silvery:passes:<cause>` (with the parent `silvery:passes` aggregator
    stage capturing both parent and child events). This enables granular
    debug filtering:

    ```bash
    DEBUG=silvery:passes                    # all causes
    DEBUG=silvery:passes:layout-invalidate  # only layout-invalidate
    DEBUG=silvery:passes:scrollto-settle    # only scrollto-settle
    ```

    Children are cached per cause (one logger per `PassCause` ever
    constructed; subsequent `logPass({ cause: x })` calls reuse the
    cached child). Zero hot-path cost beyond a `Map.get`.
  - Trimmed three legacy enum buckets that observed 0/0/0 records in the
    v2 corpus (`viewport-dependent`, `text-measurement-feedback`,
    `resize-resettle`). The unknown-bucket synthesis (fee71c54) makes
    them redundant — any uncategorized commit lands in `unknown` with
    its own pass index attached.
  - Two-switch UX retained. An earlier draft auto-mapped
    `SILVERY_INSTRUMENT=1 → DEBUG=silvery:passes` for one-switch UX, but
    that broke 4 vendor tests (`box-in-text-warning` / `input-owner`)
    that intercept `console.warn`. Setting DEBUG globally interacts with
    silvery's dev-debug warn routing in a way that hides expected warns.
    The aggregator stage is always wired into the pipeline regardless
    of DEBUG, so categorical capture works without it. DEBUG is only
    needed when the user wants events also piped to console.

The v3.x distribution matches v2 within sampling noise — every revision
is plumbing-only, no semantic changes to what counts as a feedback edge.

## v3 capture (loggily-routed) — confirmation snapshot

Smaller corpora than the v2 baseline (run during the migration to verify
end-to-end correctness, not for fresh statistics) but the distribution
shape matches v2 within sampling noise:

silvery vendor features (170 test files / 1999 tests / 100 app teardowns):

```
total                2404 records
layout-invalidate    2034 (84.6%)  edges: scrollRect ×778, screenRect ×778, boxRect ×478
viewport-resize       289 (12.0%)  edges: h ×281, wh ×8        [depth-0 root]
scrollto-settle        71 ( 3.0%)  edges: scrollTo:newIntent ×71
unknown                10 ( 0.4%)
pass-0 commits:        11 (no test reached pass 1+)
```

km-tui termless-driving suite (4 test files / 54 tests / 5 app teardowns):

```
total               11538 records
layout-invalidate   11313 (98.0%)  edges: scrollRect ×5003, screenRect ×5003, boxRect ×1307
                                   nodes: silvery-box ×11247, silvery-box#main ×66
scrollto-settle       216 ( 1.9%)  edges: scrollTo:newIntent ×216
viewport-resize         9 ( 0.1%)  edges: h ×9                  [depth-0 root]
pass-0 commits:        69 (no test reached pass 1+)
```

Both confirm:

1. **Loggily integration end-to-end correct.** Records flow
   `logPass` → `passLog.debug?.("pass", record)` (on the per-cause
   child namespace `silvery:passes:<cause>`) → loggily pipeline →
   aggregator stage → categorical store → JSONL on teardown /
   process exit.
2. **Dominant edge unchanged from v2.** layout-invalidate retains
   84-98% share depending on subscriber density (silvery features
   sparse, km-tui dense).
3. **Bound proposal unchanged from v2.** Maximum convergence depth
   observed remains pass 0→1 across all 105 app teardowns. C3b can
   replace `MAX_SINGLE_PASS_ITERATIONS = 15` with `MAX = 2`.

## Summary (v2)

| Metric | silvery features | km-tui | Combined |
|---|---:|---:|---:|
| Test files | 511 (full vendor) | 126 | 637 |
| Tests | 11 365 / 11 367 (2 perf flake under load) | 2 528 / 2 534 (6 flake under load) | 13 893 |
| App teardowns recorded | 579 | 6 | 585 |
| Extra-pass causes recorded | 4 885 | 11 581 | 16 466 |
| layout-invalidate share | 91.0% | 98.0% | 95.9% |
| viewport-resize share | 6.9% | 0.1% | 2.1% |
| scrollto-settle share | 1.9% | 1.9% | 1.9% |
| unknown share | 0.2% | 0.0% | 0.07% |
| Max convergence depth observed | pass 0→1 | pass 0→1 | pass 0→1 |

km-tui shows much higher absolute per-teardown layout-invalidate
counts (~1 930 / teardown) reflecting its real-world useBoxRect /
useScrollRect subscriber density. silvery features (mostly
unsubscribed renders) shows the structural baseline (~8 / teardown).

## Combined: by cause

| Cause | Count | % | Notes |
|---|---:|---:|---|
| layout-invalidate | 15 799 | 95.9% | Subscriber-observed only (gated via `hasLayoutSignals(node)`) |
| viewport-resize | 344 | 2.1% | Root trigger, not a feedback edge |
| scrollto-settle | 312 | 1.9% | newIntent 311 / recovery 1 |
| unknown | 11 | 0.07% | Synthesized by `notePassCommit` when no specific cause was attributed |
| wrap-reflow | 0 | 0.0% | Wired in measure-phase but no fit-content/snug-content node hit a delta in this run |
| intrinsic-shrinkwrap | 0 | 0.0% | Same as wrap-reflow |
| sticky-resettle | 0 | 0.0% | km-tui doesn't use sticky children in covered tests |
| resize-resettle | 0 | 0.0% | No resize-during-batch case in corpus |
| decoration-remap, focus-scroll-into-view, font-metrics-changed, async-image-size, theme-metric-changed | 0 | 0.0% | Not yet wired (decoration-remap requires reaching into @silvery/ag, focus-scroll-into-view + the rest need their producer paths to land first) |
| viewport-dependent, text-measurement-feedback | 0 | 0.0% | Legacy buckets retained for back-compat |

The "unknown" bucket is synthesized when a pass commits React work but
no specific PassCause was emitted during it. 11 / 16 466 = **0.07%**,
well under the 10% completeness threshold. The current categories cover
≥99.93% of observed feedback edges that the wiring touches.

## Per-pass-index commits

Across all observed convergence loops, only pass 0 ever committed React
work that forced pass 1. **No test reached pass 2 or beyond.**

| Corpus | Pass 0 commits | Pass 1+ commits |
|---:|---:|---:|
| silvery features (full vendor) | 14 | 0 |
| km-tui | 69 | 0 |
| Combined | 83 | 0 |

The MAX_SINGLE_PASS_ITERATIONS=15 budget is **massively over-budgeted**
relative to observed depth. The next-frame headroom for safety is at
most 1 extra pass.

## silvery features — by cause

```
layout-invalidate — 4 444 (91.0%)
  edges: scrollRect × 1 594, screenRect × 1 594, boxRect × 1 256
  nodes: silvery-box × 4 444

viewport-resize — 335 (6.9%)  [depth-0 root trigger, not a feedback edge]
  edges: h × 326, wh × 9 (height-only resize dominates — common in
                          inline mode where dims change as content grows)

scrollto-settle — 95 (1.9%)
  edges: scrollTo:newIntent × 94, scrollTo:recovery × 1

unknown — 11 (0.2%)
  detail: pass-0-uncategorized-commit × 11
```

## km-tui — by cause

```
layout-invalidate — 11 355 (98.0%)
  edges: scrollRect × 5 017, screenRect × 5 017, boxRect × 1 321
  nodes:
    silvery-box × 11 286
    silvery-box#main × 69

scrollto-settle — 217 (1.9%)
  edges: scrollTo:newIntent × 217

viewport-resize — 9 (0.1%)
  edges: h × 9
```

km-tui has high subscriber density: useScrollRect / useBoxRect are
heavily used by board / kanban / list components. The layout-invalidate
percentage stays high after gating because every layout pass actually
DOES invalidate observed rects in this app. This is the real signal,
not noise.

## Side-by-side comparison

|  | silvery features | km-tui |
|---|---:|---:|
| layout-invalidate per teardown | 7.7 | 1 893 |
| viewport-resize per teardown | 0.58 | 1.5 |
| scrollto-settle per teardown | 0.16 | 36.2 |

km-tui exercises ~245× more layout-invalidate edges per teardown than
silvery features. That gap is the subscriber-density signal: km-tui's
board / kanban components consume rect signals heavily; silvery's own
test fixtures are mostly bare-render.

## Dominant feedback edge

**Dominant feedback edge: `layout-invalidate` (95.9% of all
extra-pass causes; specifically subscriber-observed rect-signal
changes in `notifyLayoutSubscribers` → `syncRectSignals` where
`hasLayoutSignals(node)` is true; top signals scrollRect / screenRect /
boxRect in 1:1:0.39 ratio).**

**Bound proposal: 1 extra pass (MAX = 2).** Observed convergence depth
is already pass 0→1 max across 585 app teardowns / 13 893 tests. C3b
can replace `MAX_SINGLE_PASS_ITERATIONS = 15` with `MAX = 2` (one
initial pass + one settle pass), making the loop a structural
invariant:

> "Subscriber-observed rect changes drain in one settle pass.
> Anything beyond that is a feedback cycle and should fail loudly
> (assert in STRICT, warn in production)."

scrollto-settle is already structurally bounded — recovery edge fires
1× per ~16k records.

viewport-resize is depth-0 (root trigger, not feedback), so it does
not contribute to the loop budget.

## Performance verification (v2)

Default behaviour (SILVERY_INSTRUMENT unset) is unchanged. The gate is
a module-level `const INSTRUMENT = process.env.SILVERY_INSTRUMENT === "1"`
that JS engines fold around the entire emission block at every hot
call site. v2 added a second gate (`hasLayoutSignals(node)`) that's a
WeakMap lookup — cheap, but only runs when INSTRUMENT is true.

Verified via hot subset benchmark (sibling-overlap-incremental +
absolute-hit-test, 3 runs each), v1 baseline:

| Variant | Mean test time |
|---|---:|
| main (no instrumentation in source) | 108 ms |
| feat/feedback-trace, INSTRUMENT off | 104 ms |
| feat/feedback-trace, INSTRUMENT on (v1) | 184 ms |

v2 has not been re-benchmarked but the OFF path is unchanged (same
gate). The ON path likely got faster (fewer object allocations
because of the subscriber gate) but capture costs depend on
subscriber density.

## Reproducing

```bash
# Silvery vendor suite
: > /tmp/silvery-pass-histogram-vendor.jsonl
SILVERY_INSTRUMENT=1 \
  SILVERY_INSTRUMENT_FILE=/tmp/silvery-pass-histogram-vendor.jsonl \
  bun vitest run --project=vendor

# km-tui suite
: > /tmp/silvery-pass-histogram-kmtui.jsonl
SILVERY_INSTRUMENT=1 \
  SILVERY_INSTRUMENT_FILE=/tmp/silvery-pass-histogram-kmtui.jsonl \
  bun vitest run apps/km-tui/tests/

# Combined aggregate
bun tools/aggregate-pass-histogram.ts \
  /tmp/silvery-pass-histogram-vendor.jsonl \
  /tmp/silvery-pass-histogram-kmtui.jsonl
```

The instrumentation lives at
`vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts` and is wired
into the convergence loops in `renderer.ts` + `runtime/create-app.tsx`,
plus the layout-invalidate / scrollto-settle / sticky-resettle emit
points in `pipeline/layout-phase.ts`,
intrinsic-shrinkwrap in `pipeline/measure-phase.ts`,
and viewport-resize in `runtime/renderer.ts`.

## Follow-ups (not blocking C3b)

These categories are scaffolded in the enum but their producers haven't
been wired yet. Wiring them touches packages outside ag-term and was
deferred to keep C3a's scope contained:

- **decoration-remap**: requires reaching into `@silvery/ag/layout-signals`
  `syncDecorationRects` (peer package — would create a downward
  dependency from ag to ag-term).
- **focus-scroll-into-view**: requires hooking `focus-events.ts` /
  `focus-manager.ts` programmatic scrollIntoView calls.
- **font-metrics-changed**: requires hooking the unicode wrap-measurer
  registry / theme density-swap path.
- **async-image-size**: requires hooking the kitty-graphics overlay
  natural-size resolution.
- **theme-metric-changed**: requires distinguishing pure-color theme
  swaps (no layout effect) from metric theme swaps (cell-size / border /
  spacing changes).
- **wrap-reflow**: separate from intrinsic-shrinkwrap when text reflows
  due to a width change without a fit-content/snug-content boundary.

The dual-pro review's full enum proposal is captured in the source
comments on `PassCause` for future reference.

## Tracking

- `km-silvery.renderer-feedback-trace` (this work, C3a)
- `km-silvery.renderer-convergence-by-design` / C3b (consumes this data)
- `km-silvery.structural-hardening` (parent epic)
