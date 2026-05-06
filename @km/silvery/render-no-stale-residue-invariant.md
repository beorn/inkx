---
aliases:
  - km-silvery.render-no-stale-residue-invariant
  - km-silvery-render-no-stale-residue-invariant
created_at: 2026-05-05T21:23:07.064Z
---

# [x] STRICT 'no-stale-residue' invariant — every cell change must trace to an explicit paint or clear op #feature #P1

closed:: 2026-05-05
closed_by:: silvery agent (wt1)

## Resolution 2026-05-05 (silvery agent / wt1)

Shipped as the **sentinel-compare** invariant under `SILVERY_STRICT=residue` (tier 2). Implementation in `vendor/silvery/packages/ag-term/src/pipeline/strict-residue.ts` (new file) wired into `renderer.ts`'s STRICT block.

The original spec proposed per-cell paint provenance, which /pro 4-leg dispatch (GPT-5.4 Pro and Claude Opus 4.6) flagged as structurally inadequate: provenance only checks **changed** cells, but the cyan-strip class is **unchanged** stale pixels carried from N-1 to N. Sentinel-compare replaces it.

Algorithm:

1. Snapshot the real prev buffer **P** (pre-frame state).
2. Clone P and poison every cell with a sentinel (rgb(254, 0, 254), char `þ`) → **P'**.
3. Run the regular incremental render against P' → **I'**. Cells the cascade skipped retain the sentinel; cells it repainted have fresh content.
4. Run a fresh-from-zero render with all pipeline state reset → **F**.
5. **Invariant**: at every (x,y), `I'[x,y] is sentinel ⇒ P[x,y] === F[x,y]`. Equivalently: at any cell where `P ≠ F`, the cascade MUST repaint and `I'` MUST NOT be the sentinel.
6. Pipeline-state contamination (postState/scrollOffset/outlineSnapshots leak between the sentinel-incremental and fresh baseline) shows up as a non-sentinel I' cell that disagrees with F.

Sentinel choice: `#FE00FE` + `þ`. Verified theme-safe — none of the 84 shipped color schemes (992 unique colors) hit `#fe00fe`. `#FF00FF` was deliberately rejected because `xtermColors` ships `brightMagenta = "#FF00FF"`.

Knob: `SILVERY_STRICT=residue` (slug; tier 2 by default). Default `SILVERY_STRICT=1` does NOT enable it (tier 2+ only). Documented in `vendor/silvery/docs/guide/debugging.md`'s "Built-in checks" table. **No new `SILVERY_*` env vars** — the canonical knob contract is preserved.

Cost: O(width × height) clone + one extra render-phase pass per frame. Tier 2 (paranoid) — runs under `bun run test:strictest`.

Tests in `vendor/silvery/tests/strict-residue.test.tsx` (17 tests):

- sentinel value verification (theme-safe RGB, char, `poisonBufferWithSentinel` helper)
- strict-gate semantics (default-off at tier 1; on at tier 2; explicit slug; `!residue` opt-out)
- comparison primitive: clean buffers don't throw; legitimate cascade-skip (prev correct) doesn't throw; deliberate cyan-strip shape DOES throw with `SENTINEL LEAK` diagnostic; pipeline-state contamination throws with the contamination diagnostic
- end-to-end integration: clean rerender at `SILVERY_STRICT=2` and `SILVERY_STRICT=residue` doesn't trip false positives

Today's STRICT invariants check (a) layout doesn't overflow, (b) incremental render matches fresh redraw. Neither catches the 'a cell was painted in frame N-1 with one bg, in frame N with another bg, but no explicit paint or clear op covered it' class — which is exactly the cyan-strip residue bug that the user saw and the entire test pipeline missed.

Proposal: add a third STRICT invariant. For every cell whose content differs between frame N-1 and frame N, the renderer must have either painted it in frame N or explicitly cleared its region. Track per-cell paint provenance during render (which node ID + which paint op touched this cell). At end of frame, diff buffers; for each changed cell with no provenance entry, throw.

Implementation: instrument the cell-write path in the buffer / output phase to record (col, row) → opId. Compare prev/curr buffers; assert every diff has a recorded op. Cost: O(width × height) extra map per frame in STRICT mode, off by default.

Acceptance:

- new env var SILVERY_STRICT_RESIDUE=1 enables the invariant
- catches synthetic 'paint a cyan cell in frame 1, paint adjacent cells but not over the cyan in frame 2 → cyan stale' fixture
- runs alongside existing STRICT modes
- existing tests still pass

Why P1: would have caught both today's silent harness failure AND the cyan-strip bug it hid.

