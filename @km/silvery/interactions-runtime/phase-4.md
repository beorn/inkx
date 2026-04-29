---
id: "@km/silvery/interactions-runtime/phase-4"
aliases:
  - km-silvery.interactions-runtime.phase-4
  - km-silvery-interactions-runtime-phase-4
created_by: Bjørn Stabell
created_at: 2026-04-06T07:03:40Z
closed_at: 2026-04-06T09:17:50Z
close_reason: 3 observer hooks (useFindState, useCopyModeState, useDragState) +
  useSelection already existed. All follow CapabilityRegistryContext +
  useSyncExternalStore pattern. 30 tests. Silvery commit 3b9ce47.
owner: bjorn@stabell.org
---

# [x] Phase 4: Remaining observer hooks (useFindState, useCopyModeState, useDragState) @km/silvery #task #P1

Add the remaining read-only observer hooks for find/copy-mode/drag. useSelection was landed in Phase 3.1 (needed for demo validation).

Same undefined-vs-null pattern as useSelection: returns undefined when the feature is not registered as a capability, returns state object otherwise.

## Scope

Create 3 read-only hooks (useSelection already exists from Phase 3.1).

## Files

CREATE:
- vendor/silvery/packages/ag-react/src/hooks/useFindState.ts (~30 lines)
- vendor/silvery/packages/ag-react/src/hooks/useCopyModeState.ts (~30 lines)
- vendor/silvery/packages/ag-react/src/hooks/useDragState.ts (~30 lines)
- vendor/silvery/tests/hooks/useFindState.test.tsx
- vendor/silvery/tests/hooks/useCopyModeState.test.tsx
- vendor/silvery/tests/hooks/useDragState.test.tsx

UPDATE:
- vendor/silvery/packages/ag-react/src/hooks/index.ts — export the 3 new hooks
- vendor/silvery/packages/ag-react/src/exports.ts — export the 3 new hooks

## API

  function useFindState(): FindState | undefined
  function useCopyModeState(): CopyModeState | undefined
  function useDragState(): DragState | undefined

Each reads from the capability registry (from Phase 2.5) via the corresponding symbol. Returns undefined if the feature is not registered.

Implementation is ~30 lines per hook — they're all the same shape as useSelection.

## Delete

Nothing.

## New tests

3 integration tests, same pattern as Phase 3.1's useSelection test:
- Returns undefined when feature missing
- Returns state when feature installed, idle
- Returns state when feature active
- Updates reactively

## Definition of Done

- [ ] 3 hook files created (~30 lines each)
- [ ] All exported from barrel
- [ ] 3 test files pass
- [ ] JSDoc on each hook documents undefined-vs-state distinction

## /complete criteria

- test -f vendor/silvery/packages/ag-react/src/hooks/useFindState.ts
- test -f vendor/silvery/packages/ag-react/src/hooks/useCopyModeState.ts
- test -f vendor/silvery/packages/ag-react/src/hooks/useDragState.ts
- grep -q 'useFindState\|useCopyModeState\|useDragState' vendor/silvery/packages/ag-react/src/hooks/index.ts
- bun vitest run vendor/silvery/tests/hooks/useFindState.test.tsx → pass
- bun vitest run vendor/silvery/tests/hooks/useCopyModeState.test.tsx → pass
- bun vitest run vendor/silvery/tests/hooks/useDragState.test.tsx → pass

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.