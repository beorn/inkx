---
id: "@km/silvery/selection-quality"
aliases:
  - km-silvery.selection-quality
  - km-silvery-selection-quality
created_by: Bjørn Stabell
created_at: 2026-04-06T10:23:24Z
closed_at: 2026-04-15T19:18:56Z
close_reason: "Grooming 2026-04-15: 3/3 action sub-beads closed
  (selection-contain-bug, selection-consolidation, InputRouter cleanup). Only
  km-silvery.demo-integration-tests survives as its own bead. Superseded by
  km-silvery.selection-focus-plateau."
---

# [x] Selection quality plateau — fix bugs, consolidate dual systems, add integration tests @km/silvery #task #P1

blocks:: [[@km/silvery/selection-focus-plateau]]

## Status (2026-04-06)

Selection works (drag highlights text, OSC 52 copies) but has quality issues:
- Old selection not visually cleared on new mousedown (full re-render attempted but may still be buggy)
- Selection not constrained to userSelect=contain boundary
- Dual selection systems: create-app.tsx inline handler (works) + SelectionFeature/InputRouter (dead path)
- No integration tests — all bugs found on first manual test

## Root Cause Analysis (/big)

23 agents built a parallel architecture (InputRouter + Features) that doesn't integrate with create-app's event loop where real mouse events arrive. The create-app selection IS the working system. The agent-built SelectionFeature never receives real events.

## Quality Plateau Plan

1. Write termless integration tests FIRST (bead: @km/silvery/demo-integration-tests)
2. Fix contain boundary in create-app.tsx (walk ag tree for userSelect=contain ancestor)
3. Fix overlay clear (force full re-render or use selection-renderer clear method)
4. Consolidate: SelectionFeature becomes bridge to create-app state, not parallel system (bead: @km/silvery/selection-consolidation)
5. Delete InputRouter mouse dispatch (dead path)

## Related Beads
- @km/silvery/selection-contain-bug (P1) — contain boundary
- @km/silvery/selection-consolidation (P2) — dual system cleanup
- @km/silvery/demo-integration-tests (P2) — termless tests for demos

## Key Files
- vendor/silvery/packages/create/src/create-app.tsx:1942-1997 — working selection
- vendor/silvery/packages/ag-term/src/features/selection.ts — agent-built (parallel, unused for real events)
- vendor/silvery/packages/create/src/with-dom-events.ts — injects selection:true into run()
- vendor/silvery/packages/ag-term/src/selection-renderer.ts — overlay rendering