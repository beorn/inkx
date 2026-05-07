---
aliases:
  - km-silvery.test-harness-via-run-not-createrenderer
  - km-silvery-test-harness-via-run-not-createrenderer
created_at: 2026-05-07T05:32:06.720Z
---

# Test harness should use run() against headless Term, not parallel createRenderer #P2

**Reframe** (from /big session 2026-05-06): the recurring "test harness diverged from production" failure class — autoRender:false hiding the (0,22) bg-residue bug, missing events stub on fakeStore, narrow test fixtures hiding width-sensitive bugs — has a single root: createRenderer is a parallel implementation of run(), not a wrapper around it.

**The real problem**: silvery-test ships its own convergence loop, its own act() boundary, and its own render schedule (`autoRender: boolean`). Production's run() / createApp().run() ship a different one. Every flag where they diverge (`autoRender`, `incremental` defaults, `maxLayoutPasses` overrides, prevPaintedBuffer init) is a place tests pass while production breaks.

**Existing coverage gaps** (closed beads do NOT cover this case):
- `@km/silvery/entry-point-parity-contracts` checks same-options-across-entry-points; the harness uses different options so no parity violation.
- `@km/silvery/defaults-contract-tests` checks default *values*; the question here is whether `autoRender` should exist at all.
- `@km/silvery/render-degenerate-frame-canary` catches blank frames; autoRender:false produced *correct-looking* stale frames.

**Target design (L4)**: createRenderer collapses into `run(<App/>, headlessTerm)`. The harness owns:
- a headless Term factory (createTermless already does this — extend or generalize)
- an `await app.settle()` helper for sync test ergonomics (replaces "test determinism" reason for autoRender:false)
- nothing else — no parallel render loop, no act() boundary, no schedule flag

Public API surface: `autoRender` removed. `incremental: false` removed (production never sets it). `maxLayoutPasses` removed (use INITIAL_RENDER_MAX_PASSES + MAX_CONVERGENCE_PASSES like production does).

**Beyond this bug**: closes the silent-fail canary class for stale-frame variants, eliminates "createRenderer fast-path" as a concept, makes silvercode visual tests the canonical end-to-end (no more synthetic vendor fixtures that "fail to reproduce the real bug" as today's incremental-bg-shrink-move docstring admits).

**Effort**: 200+ test files migrated. Mostly mechanical; some per-file judgment for tests that genuinely depend on synchronous-render semantics (unit-level layout tests). Probably a phased migration:
- Phase 1: deprecate `autoRender: false` — log a warning, default to `true`, don't break callers.
- Phase 2: settle() helper lands; tests adopt incrementally.
- Phase 3: createRenderer becomes a thin wrapper over run() + headless Term.
- Phase 4: delete divergence flags from public API.

**First step**: NOT migrate yet. Ship this design as a P2 bead with the reframe captured. Migration waits until current silvercode test wave fully closes (silvery agent verification still in flight).

**Adjacent reframe**: @km/silvercode/fakes-by-factory-not-literal — the fakeStore missing-events-slot class is fixed by constructing fakes from the same factory as production stores, not hand-rolled literal objects.

## Why didn't we do this before?

Path dependence — three load-bearing reasons createRenderer stuck around:

1. **Speed**: createRenderer ~5ms/op (stripped pipeline, no ANSI). createTermless (real ANSI through xterm.js) ~50ms/op. 10× difference on 700+ unit tests is real friction.
2. **Synchronous ergonomics**: tests want "render → assert" without await. Production's run() is async + event-driven. `autoRender: false` was the workaround; nobody wrote a synchronous `await app.settle()` ergonomic to replace it.
3. **No prior fire**: divergence didn't *visibly* bite until the chat composer + autoRender:false combo. The closed beads (entry-point-parity, defaults-contract) thought they covered this — they don't, because they assume entry points share options. createRenderer's options aren't shared with run(); they're parallel.

The doctrine that *would* have caught it (parity contracts) closed before this round of bugs surfaced. Today's incident broke the "good enough" assumption.

## Are we giving up 10× speed? (No — closer to 1.5-2×)

The 10× figure compared createRenderer vs createTermless, which is the wrong baseline. createRenderer optimizes two separate things conflated under one number:

1. **Output-phase skip** (~3-5× of the speedup): app.text / app.cell read directly from TerminalBuffer. No ANSI generation, no SGR encoding, no diffing.
2. **Synchronous render schedule** (~1.5-2×): autoRender:false skips React event-loop ticks + microtask settle.

createTermless adds *more* on top — it feeds output into xterm.js and runs the emulator (~5× by itself).

The actual proposal is `run(<App/>, headlessTerm)` where headlessTerm has `term.paint = undefined` (silvery already supports this — see CLAUDE.md "term.paint() and term.frame"). Output-phase skips entirely. The remaining cost is just the schedule unification.

Realistic comparison:

| Mode | Estimated cost |
|---|---|
| createRenderer today | ~5ms |
| run(<App/>, headlessTerm) with output-skip | ~7-10ms |
| createTermless (xterm.js) | ~50ms |

So we give up ~1.5-2×, not 10×. That's the cost of production-equivalent rendering semantics.

## Dual-mode drift detection (preferred — same pattern as `SILVERY_STRICT_TERMINAL=all`)

Don't choose between createRenderer and run(headlessTerm) — run **both** under STRICT, assert observable equality, fail on drift. This is the same shape as:
- `SILVERY_STRICT_TERMINAL=all` — vt100 + xterm + ghostty in parallel, identical output asserted
- `SILVERY_STRICT=incremental` — incremental + fresh on every render, equal asserted
- `@km/silvercode/fakes-by-factory-not-literal` deep-mode — fake + real, equal asserted

Apply the same gate: introduce `SILVERY_STRICT=harness` (a new slug under the existing umbrella, per the "no new SILVERY_* env vars" rule). When set:

- Every `createRenderer(...)` call runs the test twice — once via the fast path, once via `run(<App/>, headlessTerm)`.
- After each scripted action, assert: `app.text` equal, `app.lines` equal, observable state equal.
- Mismatch fails with a structural diff naming which slot diverged (e.g. "frame 2: createRenderer cell (0,22).bg = null, run() cell (0,22).bg = rgb(61,67,79)").

Cost model:

| CI mode | What runs | Speed |
|---|---|---|
| `bun run test:fast` (default) | createRenderer only | ~5ms/op (preserved) |
| `bun run test:strictest` (already exists, opts into STRICT=2) | both, drift gate fires | ~12ms/op (5+7) |
| nightly + pre-release | `SILVERY_STRICT=harness` | drift caught before merge |

This is strictly better than the "two-tier" or "align defaults" alternatives:
- Keeps the 5ms/op fast path for everyday CI.
- Catches drift before it ships (today's autoRender:false bug would have failed under harness mode).
- No new doctrine — uses existing STRICT umbrella + `isStrictEnabled(slug, minTier)` plumbing.
- No author choice burden — same test code runs in both modes.

**Implementation sketch**: `createRenderer` checks `isStrictEnabled("harness", 1)` at construction. If enabled, internally constructs a parallel `run(<App/>, headlessTerm)` instance. Every public method (`rerender`, `press`, `paste`, etc.) dispatches to both and compares results. Failure throws with diff. The wrapper lives in `@silvery/test`; production code unaffected.

**Phasing**:
- Phase 1: ship the harness drift gate, default off, `SILVERY_STRICT=harness` to opt in.
- Phase 2: turn on for nightly CI; fix any drift the gate catches.
- Phase 3: when drift count is zero for 30 days, promote to `STRICT=2` (always-on under strictest).
- Phase 4 (only if needed): deprecate `autoRender: false` once everything still works under harness mode. Full collapse becomes mechanical.
