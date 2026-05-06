---
mentions:
  - km
id: "@km/tui/focus"
aliases:
  - km-tui.focus
  - km-tui-focus
created_by: Bjørn Stabell
created_at: 2026-04-08T06:50:43Z
closed_at: 2026-04-15T19:18:57Z
close_reason: "Grooming 2026-04-15: 3/4 children closed (focus-cardlike,
  detail-spatial-nav, focusscope-inputlayer). km-tui.anchor-focus-selection (P4
  vision) reparented to km-tui. Focus/selection unification now tracked under
  km-silvery.selection-focus-plateau."
owner: bjorn@stabell.org
---

# [x] Focus & selection unification — from spatial nav to tree Paths @km/tui #epic #P1

Unify km's selection/focus/navigation into a coherent system built on silvery's focus primitives.

## Status (2026-04-08)

Phase A (semantic state spec) — DONE. Committed selection-state-spec.md.
hierarchical-node-state — DONE (closed). Delivered reduced signals, purged old engine.
Phase B (v3 reactive tree) — DONE. Computed-based engine, -830 LOC.

## Remaining children

### @km/tui/focus-cardlike (P2) — NEAR COMPLETE

Reduced signals (editingDescendant, cursorDescendant) are live in CardColumn.tsx.
Remaining: purge legacy expandedEditCardId (5 refs in 2 files) and cursorInDescendant (6 refs in 2 files), replace with editingDescendant/cursorDescendant signals.

### @km/tui/detail-spatial-nav (P0) — STILL NEEDED

Virtual __meta__ nodes + deriveDetailColumns still actively used.
focusDirection not implemented yet. This is about replacing virtual nodes with real React components.

### @km/silvery/selection-consolidation (P2) — STILL NEEDED

SelectionFeature + InputRouter in silvery still exist alongside km board-level selection.

### @km/tui/focusscope-inputlayer (P3) — DEFERRED (design phase)

InputLayerProvider still in use. Architecture documented in bead notes.

### @km/tui/anchor-focus-selection (P4) — LONG-TERM

Positional indices (colIndex, cardIndex) still primary selection representation.

