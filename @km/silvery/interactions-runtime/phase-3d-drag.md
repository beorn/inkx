---
id: "@km/silvery/interactions-runtime/phase-3d-drag"
aliases:
  - km-silvery.interactions-runtime.phase-3d-drag
  - km-silvery-interactions-runtime-phase-3d-drag
created_by: Bjørn Stabell
created_at: 2026-04-06T07:07:28Z
closed_at: 2026-04-06T08:49:07Z
close_reason: DragFeature (210 lines), DRAG_CAPABILITY, withDomEvents extended
  with drag at priority 150, 20 tests pass. Silvery commit 73396e1.
---

# [x] Phase 3d: Extend withDomEvents for draggable (drag-and-drop) @km/silvery #task #P1

Extend withDomEvents with drag-and-drop. Uses input-router for mouse priority (drag: 150, beats selection: 100 when draggable=true). Lives in ag-term/src/features/.

## Scope

Extend withDomEvents() with drag handling:
1. On mousedown, if target is draggable=true, route via input-router to drag path instead of selection
2. Drive pointer machine from @silvery/headless for drag gestures
3. Track drag state, drop target via findDropTarget (existing helper in drag-events.ts)
4. Dispatch onDragEnter/Leave/Over/Drop to nearest ancestor
5. Register drag ghost overlay via input-router z-order priority 200 (above selection)
6. Create DragFeature via createDragFeature() (new: features/drag.ts)

## Files

CREATE:
- vendor/silvery/packages/ag-term/src/features/drag.ts — DragFeature service
- vendor/silvery/tests/features/drag.integration.test.ts — basic drag + drop
- vendor/silvery/tests/features/drag-vs-selection.integration.test.ts — draggable beats userSelect
- vendor/silvery/tests/features/drag-cancel.integration.test.ts — Escape cancels

UPDATE:
- vendor/silvery/packages/create/src/with-dom-events.ts (+~60 lines)
- vendor/silvery/packages/ag-term/src/features/index.ts — add drag export
- vendor/silvery/packages/ag-term/src/drag-events.ts — imports use './features/drag' or are internal helpers only

## Services

  interface DragFeature {
    state: Observable<DragState | null>
    cancel(): void
  }

## Delete

Nothing.

## New tests

3 integration tests including conflict resolution (selection vs drag priority).

## /complete criteria

- test -f vendor/silvery/packages/ag-term/src/features/drag.ts
- grep -q 'draggable\|drag' vendor/silvery/packages/create/src/with-dom-events.ts
- test -f vendor/silvery/tests/features/drag.integration.test.ts
- test -f vendor/silvery/tests/features/drag-vs-selection.integration.test.ts
- test -f vendor/silvery/tests/features/drag-cancel.integration.test.ts
- bun vitest run vendor/silvery/tests/features/drag*.integration.test.ts → all pass
- bun vitest run vendor/silvery → full suite passes

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.