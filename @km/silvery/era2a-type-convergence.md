---
id: "@km/silvery/era2a-type-convergence"
aliases:
  - km-silvery.era2a-type-convergence
  - km-silvery-era2a-type-convergence
created_by: claude:fed8de9e
created_at: 2026-03-25T05:22:37Z
closed_at: 2026-03-25T05:24:58Z
close_reason: Merged into km-silvery.era2a-1-textframe — convergence happens in
  Phase 1, not separately
owner: bjorn@stabell.org
---

# [x] Era2a Phase 1b: converge cell/frame types — one FrameCell, one TextFrame @km/silvery #task #P1

Post-era2a type convergence: eliminate duplicate cell/frame types across silvery + termless.

## Current State (5 cell-like types, 3 frame-like types)

**Cell types:**
- `Cell` (buffer.ts) — mutable, Color (number|RGB|null), CellAttrs object. INTERNAL pipeline write.
- `FrameCell` (@silvery/ag) — immutable, RGB|null, flattened bools. PUBLIC read API.
- `Cell` (termless) — immutable, RGB|null, flattened bools. 95% identical to FrameCell.
- `CellView` (termless) — Cell + row/col position.
- `Style` (buffer.ts) — fg/bg/underlineColor/attrs subset. INTERNAL diff optimization.

**Frame types:**
- `TextFrame` (@silvery/ag) — text/ansi/lines/width/height/cell()/containsText(). PUBLIC.
- `TermScreen` (ag-term types) — getText()/getLines()/containsText(). Duck-type for termless.
- `RegionView` (termless) — getText()/getLines()/containsText(). Lazy view.

## Target State (2 public types, 2 internal types)

**Public (shared between silvery + termless):**
- `FrameCell` — THE cell type. Immutable, resolved RGB|null, flattened bools. Lives in @silvery/ag.
- `TextFrame` — THE frame type. Immutable snapshot. Lives in @silvery/ag.

**Internal (pipeline only):**
- `Cell` (buffer.ts) → rename to `BufferCell` or keep as-is (internal, no public exposure)
- `TerminalBuffer` → stays as-is (internal mutable write buffer)

**Eliminated:**
- termless `Cell` → import FrameCell from @silvery/ag instead
- `CellView` → FrameCell + { row, col } or just use FrameCell with positional context
- `TermScreen` → TextFrame (strict superset)
- `RegionView` → TextFrame or adapter that implements TextFrame
- `Style` → stays internal (diff optimization, not public)

## Key Decisions Needed
- Should termless depend on @silvery/ag for FrameCell? Or define a shared cell package?
- TerminalBuffer rename: RenderBuffer? WriteBuffer? Or keep name (its internal)?
- RegionView → TextFrame: termless views are lazy (recompute on access), TextFrame is snapshot. Adapter or convergence?

## Scope
This is a DRY/naming cleanup AFTER era2a ships. No functional changes — just type convergence and import path cleanup. Do at the end of era2a (after Phase 6) or as first era2b task.

**Delete**: TermScreen type, duplicate Cell type in termless (if converged). Remove redundant re-exports.
**/complete**: grep for TermScreen → 0 hits. Only 2 public cell/frame types exist (FrameCell + TextFrame). No duplicate cell definitions across packages.