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

### Phase 0 — Audit cross-frame state (preparation, no code changes)

Catalogue every place mutable state survives a frame in `packages/ag-term/src/pipeline/*` + `ag-term/src/buffer.ts` + `ag-term/src/renderer.ts`. For each: what's the cache for, what would break if it didn't survive, what's the cost of recreating it per-frame.

**Targets to inspect (start here):**

- `RenderPostState` (`ag.ts`) — the explicit "carry-over" container. Every field is a candidate.
- `outlineSnapshots` (hoisted onto `RenderPostState` in `78c63075`) — outline rectangles painted last frame, used to clear stale outlines this frame.
- `ExcessClearGate` accumulators (`c7cf9390`) — structural invariant for excess-area clears.
- `clearNodeRegion` / `clearExcessArea` decoupling (`5c3a266c`) — region-clear coordinator state.
- `TerminalBuffer` itself (`buffer.ts`) — incremental `setCell`/`fill`/`scrollRegion` ops mutate prev-frame buffer in place.
- `prevBuffer` / `currBuffer` clone-then-mutate flow in `renderer.ts` (`render()`).
- `instance.prevBuffer` + `instance.prevPostState` references that live on the renderer instance across frames.
- Any `stateRef.current` / `useRef` patterns inside pipeline phases that bypass React's per-render scope.

**Output of Phase 0**: a table in this bead with columns `(cache, owner, purpose, perf cost if rebuilt fresh, hidden state risk, recommended phase)`. Filed as a sub-bead `@km/silvery/render-stateless-pipeline-audit` with the table.

### Phase 1 — Move pipeline caches to per-frame scope

Smallest blast radius first: `outlineSnapshots`. Currently lives on `RenderPostState` and survives across `render()` calls. New shape: created at the top of each `render()` call, populated during the frame, discarded at end. Outline-clear logic that needed prev-frame snapshots either reads from the prev-buffer's actual contents or doesn't need them at all (depends on what `clearPreviousOutlines` actually uses them for — Phase 0 audit determines).

Then `ExcessClearGate` and `clearNodeRegion` caches. Each migrated independently with STRICT regression tests at every step.

### Phase 2 — Rebuild Buffer from scratch each frame

The big change. Each `render()` call:
1. Allocates a fresh `Buffer` (or reuses a pre-allocated one, zeroed out).
2. Renders into it from layout + model. No reads from `prevBuffer`.
3. The output stage diffs the new buffer against the last-flushed buffer (kept by the Term, not by the pipeline) and emits the minimal ANSI delta.

`scrollRegion` becomes a pre-render hint to the diff output stage, not a buffer mutation. `restyleRegion` and `mergeAttrsInRect` become layout/style annotations consumed during the fresh paint, not in-place mutations.

### Phase 3 — Retire downstream invariants

Once Phases 1+2 land:
- `SILVERY_STRICT=incremental` (the "incremental ≡ fresh" check) becomes trivial — they ARE the same render. Remove it from the suite once it's been a no-op for one release cycle.
- `SILVERY_STRICT=residue` (sentinel-compare) becomes structurally impossible to fail — every cell is painted from a clean slate every frame. Mark as deprecated, remove after one release cycle.
- The degenerate-frame canary (`SILVERY_STRICT=canary`) remains useful — it catches harness misconfigs orthogonal to pipeline state.

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
