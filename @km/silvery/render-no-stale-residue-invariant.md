---
aliases:
  - km-silvery.render-no-stale-residue-invariant
  - km-silvery-render-no-stale-residue-invariant
created_at: 2026-05-05T21:23:07.064Z
---

# STRICT 'no-stale-residue' invariant — every cell change must trace to an explicit paint or clear op #feature #P1

Today's STRICT invariants check (a) layout doesn't overflow, (b) incremental render matches fresh redraw. Neither catches the 'a cell was painted in frame N-1 with one bg, in frame N with another bg, but no explicit paint or clear op covered it' class — which is exactly the cyan-strip residue bug that the user saw and the entire test pipeline missed.

Proposal: add a third STRICT invariant. For every cell whose content differs between frame N-1 and frame N, the renderer must have either painted it in frame N or explicitly cleared its region. Track per-cell paint provenance during render (which node ID + which paint op touched this cell). At end of frame, diff buffers; for each changed cell with no provenance entry, throw.

Implementation: instrument the cell-write path in the buffer / output phase to record (col, row) → opId. Compare prev/curr buffers; assert every diff has a recorded op. Cost: O(width × height) extra map per frame in STRICT mode, off by default.

Acceptance:
- new env var SILVERY_STRICT_RESIDUE=1 enables the invariant
- catches synthetic 'paint a cyan cell in frame 1, paint adjacent cells but not over the cyan in frame 2 → cyan stale' fixture
- runs alongside existing STRICT modes
- existing tests still pass

Why P1: would have caught both today's silent harness failure AND the cyan-strip bug it hid.
