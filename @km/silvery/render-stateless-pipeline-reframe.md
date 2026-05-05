---
aliases:
  - km-silvery.render-stateless-pipeline-reframe
  - km-silvery-render-stateless-pipeline-reframe
created_at: 2026-05-05T22:30:00.000Z
---

# Render pipeline → stateless per-frame: eliminate cross-frame state, retire stale-paint class #epic #P1

## The problem

Silvery's render pipeline keeps mutable state across frames: `outlineSnapshots`, `ExcessClearGate` accumulators, `clearNodeRegion` caches, and the buffer itself. Every cross-frame cache is a place where stale data leaks; every defensive invariant we stack (canary, residue, golden snapshot) is downstream of that decision. The cyan-strip class has shipped 7+ times in 14 days as patch-on-patch fixes (`3adc242b`, `78c63075`, `c7cf9390`, `5c3a266c`) — the class isn't going away while the pipeline carries cross-frame state.

## Current level → target level

**L1** (runtime guards / canaries) → **L4** (impossible by construction).

## The reframe

Per-frame rendering becomes a pure function:

```
(model, layout, term) → Buffer
```

Each frame: build a new Buffer from scratch; diff against last-flushed Buffer at the output stage for ANSI minimization. Pipeline caches (`outlineSnapshots`, `ExcessClearGate`, `clearNodeRegion`) live in a per-frame scope, recreated each render — never carried forward.

## What it solves

- Eliminates the entire stale-paint / cross-frame-state-leak class
- Makes "incremental ≡ fresh" trivially true (they're the same render)
- Retires the need for `SILVERY_STRICT_RESIDUE` (no residue can exist)
- Retires the need for "true-fresh-with-pipeline-reset" hacks
- Removes hidden-state debugging burden
- Performance: 43,200 cells @ 60 Hz is trivial on modern CPUs; we already pay this for layout

## Phased plan

1. **Audit cross-frame state** in `packages/ag-term/src/pipeline/*` and `ag-term/src/buffer.ts`. Catalogue every `prev*` ref, every cache, every accumulator. Document what each one's job is and what would break if it didn't survive a frame.
2. **Phase 1**: move pipeline caches to per-frame scope (`outlineSnapshots` first; smallest blast radius).
3. **Phase 2**: rebuild Buffer from scratch each frame; output stage owns the prev-buffer for diff.
4. **Phase 3**: retire downstream invariants no longer needed (`SILVERY_STRICT_RESIDUE`, the "incremental ≡ fresh" check becomes trivial).

## Effort

2-4 weeks, mid-risk. Touches `packages/ag-term/src/pipeline/`. Mandatory: silvery agent only, multiple `SILVERY_STRICT_TERMINAL` backends in CI throughout.

## Context

Filed after the cyan-strip incident (2026-05-05) and the /pro 4-leg dispatch on the canary plan, where GPT-5.4 Pro and Claude Opus 4.6 independently identified that pipeline state contaminates the fresh oracle (the "true-fresh" suggestion was the same insight). Per-bead detailed context in `@km/silvery/render-no-stale-residue-invariant`. The /big synthesis (silent-fail = pipeline state across frames) makes this the architectural target.

## Memory

Captured in `feedback-silent-fail-canaries.md`. Principle: when "did the work" ≠ "no exception thrown", add an output canary. Eventually the right answer is to make the work itself stateless.

## Related beads

- `@km/silvery/render-light-blue-bg-strip-residue` — the originating P1 bug; closes once pipeline is stateless
- `@km/silvery/render-no-stale-residue-invariant` — STRICT residue invariant; can be deprecated once L4 lands
- `@km/silvery/render-degenerate-frame-canary` — the L1 canary that surfaced the harness silent-fail (closed)
- `@km/all/test-system/test-board-empty-frame` — the harness defect (closed)
- `@km/all/test-system/full-app-default-dimensions` — defaults at 360×120 (closed)
- `@km/all/test-system/real-vault-golden-snapshot` — golden cell snapshot (open, P2)
