# Render-plan-commit (paint-clear-invariant Phase 1)

Status: Phase 1 — flag-gated scaffold + parity test
Bead: km-silvery.paint-clear-invariant
Parent: km-silvery.structural-hardening
Reference: silvery 168b4989 (existing `clearExcessArea hasPrevBuffer` guard)
Reviews: pro/Kimi K2.6 dual review (km-all.plateau-90 / 2026-04-27)

## Problem

The current render phase walks the node tree and mutates a shared
`TerminalBuffer` as it goes. Paint and clear operations are interleaved
with traversal: a parent renders its background, then a child clears its
shrunk excess area, then a sibling paints over part of that area.
Because operations execute in tree-walk order, the only thing keeping
"clear after paint" from corrupting freshly-painted neighbour cells is a
runtime guard — the `hasPrevBuffer` check at silvery 168b4989. Forget the
guard, swap the order, miss a sibling-cascade hand-off, and the bug
returns.

The structural plateau target (L4 in the per-bead rubric) is making the
wrong order **unrepresentable**: by the time anything writes to the
buffer, the order is fixed by data, not by walk order. Phase 3 then
deletes the runtime guard because the call site that would need it
cannot be reached.

## Approach: render plan + commit

Render produces an immutable **render plan** — a flat list of buffer
operations annotated with the node and rect they target. `commitPhase`
applies the plan against the buffer in a deterministic order:

1. Background fills (lowest "z")
2. Region clears (excess + descendant overflow)
3. Content paints (text, borders)
4. Decoration overlays (outlines)

Paint-then-clear cannot happen because clears are committed before
paints in the commit step, regardless of when the render phase emitted
them. The render phase becomes a pure producer; the commit phase is the
only mutator of buffer state.

### Why not double-buffer swap

Considered and rejected for Phase 1 because it forces full repaint each
frame: the back buffer starts empty, all visible content has to be
re-rendered before the swap. Silvery's incremental cascade (skip clean
subtrees, clone the previous buffer) is load-bearing for performance —
the 192× ANSI byte reduction in inline mode and the ~50-children-per-
frame skip rate in scroll containers depend on it. A swap-only model
would regress these by 1-2 orders of magnitude. We can revisit
double-buffer if commit-order ordering proves insufficient, but the data
suggests it won't.

### Why not damage-list composition (alone)

Damage rects are necessary but not sufficient. The current bug is not
"we forgot to mark a region dirty" — it is "we cleared a region that
overlapped a freshly-painted sibling". A pure damage list still has the
same imperative paint/clear interleaving inside each damaged region.
Render-plan-commit subsumes damage tracking (every plan entry is a
damage rect with intent + style) and adds the ordering guarantee that
makes the bug unrepresentable.

## Phase 1 scope (this session)

The full L4→L5 transition is multi-phase work. Phase 1 lands the
substrate and proves it for one scenario:

- **In**: Plan/commit types; a flag-gated alternate path that produces
  the same buffer for one scene; one parity test that runs both paths
  and asserts cell-equivalence.
- **Out**: Removing the `hasPrevBuffer` guard (Phase 3); making
  render-plan-commit the default (Phase 2); tearing down the legacy
  imperative path (Phase 3); covering all incremental render scenarios
  (Phase 2).

Phase 1 success criteria:

1. `SILVERY_RENDER_PLAN=1 bun vitest run vendor/silvery/tests/` passes
   for the parity test.
2. Bare `bun vitest run vendor/silvery/tests/` (no flag) is unchanged —
   default path is the existing imperative renderer.
3. `npx tsc --noEmit` reports zero net new errors.
4. The parity test runs the same scene through both paths and asserts
   the resulting `TerminalBuffer.cells[]` are identical cell-for-cell.

## Type sketch

```ts
export type RenderOp =
  | { kind: "fillBg"; rect: Rect; color: Color | null; nodeId?: number }
  | { kind: "clearRect"; rect: Rect; color: Color | null; nodeId?: number }
  | { kind: "paintCells"; cells: CellPatch[]; nodeId?: number }
  | { kind: "decoration"; rect: Rect; ops: DecorationOp[]; nodeId?: number }

export interface RenderPlan {
  readonly ops: readonly RenderOp[]
  readonly width: number
  readonly height: number
}

export function commitPlan(buffer: TerminalBuffer, plan: RenderPlan): void
```

`commitPlan` applies ops in `kind` priority order: `fillBg → clearRect →
paintCells → decoration`. Within a kind, ops are applied in plan order
(stable, deterministic).

## Phase 1 implementation

The naive approach — rewriting `renderNodeToBuffer` to emit ops instead
of mutating — is too risky for one session. Phase 1 takes a thinner
seam:

1. Introduce `RenderOp`, `RenderPlan`, `commitPlan` types in a new
   `pipeline/render-plan.ts`.
2. Introduce `renderPhasePlan(root, prevBuffer, ctx)` which is a
   capture-and-replay wrapper: runs the existing `renderPhase` against a
   recording buffer that captures every mutation as an op, returns the
   plan. Then `commitPlan(emptyClone, plan)` produces the final buffer.
3. Gate the new path behind `SILVERY_RENDER_PLAN=1`. When the flag is
   off, the existing `renderPhase` runs unchanged.
4. Add `tests/features/render-plan-parity.test.tsx` — one parity test
   that runs a non-trivial scene through both paths and asserts the
   resulting buffers match cell-for-cell.

The capture-and-replay seam is intentionally over-conservative: it does
not yet make the bug unrepresentable — that requires Phase 2's
out-of-band emit (the renderer no longer has a buffer to mutate). But it
proves the plan/commit substrate works against the real pipeline and
gives Phase 2 a tested commit step to land against.

## Phase 2 (next session, not this one)

- Switch the renderer from "mutate buffer" to "emit ops" — `renderBox`,
  `renderText`, `renderDecorationPass` produce ops instead of calling
  `buffer.fill`/`buffer.fillBg`/etc.
- Make plan-and-commit the default; `SILVERY_RENDER_PLAN=0` opts back to
  legacy for one release.
- Validate against the full STRICT vendor suite + km-tui showcase.

## Phase 3 (final)

- Delete `clearExcessArea` from the imperative path (it becomes a
  derived clear-rect op in the plan).
- Delete the `hasPrevBuffer` guard (call site no longer reachable).
- Add a property test that fuzzes paint-and-clear orders and asserts
  cell equivalence holds — the bug class is closed.
- Remove `SILVERY_RENDER_PLAN` env var.

## Parity strategy

Cell-by-cell equivalence is the strongest possible parity claim for a
buffer-emitting pipeline. The parity test:

1. Renders a non-trivial scene (board with overflow scroll, sticky
   header, absolute overlay, shrinking child) through legacy path.
2. Renders the same scene through plan/commit path.
3. Walks both `TerminalBuffer.cells[]` arrays and asserts each
   `(char, fg, bg, attrs)` tuple matches.
4. Re-renders after a state change (e.g., shrink the absolute child)
   and re-asserts — this is the scenario that originally tripped
   `clearExcessArea` in the ai-chat-incremental-mismatch repro.

Failure of the parity test means the plan/commit ordering diverges from
the imperative ordering for that scene. The fix is to extend the plan
with the missing op kind, not to hide the divergence.
