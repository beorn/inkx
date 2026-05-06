---
mentions:
  - silvery
  - km
id: "@km/silvery/interactions-runtime/phase-2"
aliases:
  - km-silvery.interactions-runtime.phase-2
  - km-silvery-interactions-runtime-phase-2
created_by: Bjørn Stabell
created_at: 2026-04-06T07:02:44Z
closed_at: 2026-04-06T08:08:29Z
close_reason: 4 machines moved to headless, pointer-state renamed to pointer, 23
  import sites updated, tests renamed and pass. Commits e402846+51f5b28 in
  silvery.
owner: bjorn@stabell.org
---

# [x] Phase 2: Move pure machines to @silvery/headless @km/silvery #task #P1

Move the 4 pure state machines from @silvery/ag-term to @silvery/headless where they belong. ALSO rename pointer-state.ts → pointer.ts (drop redundant 'state' suffix, consistent with flat no-suffix headless convention).

## Scope

Move FROM vendor/silvery/packages/ag-term/src/ TO vendor/silvery/packages/headless/src/:

- selection.ts (unchanged name)
- pointer-state.ts → pointer.ts (RENAMED — 'state' suffix is redundant, all machines carry state)
- find.ts (unchanged name)
- copy-mode.ts (unchanged name)

Matches existing headless convention: readline.ts, select-list.ts — flat, no suffix.

Their shared primitive types (Position, SelectionRange, SelectionScope, SelectionGranularity) either move with the owning file or consolidate into headless/types.ts.

## Files

MOVE (delete old location, create in new):

- selection.ts → headless/src/selection.ts
- pointer-state.ts → headless/src/pointer.ts (RENAMED)
- find.ts → headless/src/find.ts
- copy-mode.ts → headless/src/copy-mode.ts

UPDATE (imports — remember pointer rename):

- vendor/silvery/packages/headless/src/index.ts — export new machines
- vendor/silvery/packages/ag-term/src/index.ts — re-export from @silvery/headless (convenience re-export, not a shim)
- vendor/silvery/packages/ag-term/src/selection-renderer.ts — import from @silvery/headless
- vendor/silvery/packages/ag-term/src/drag-events.ts — import Position from @silvery/headless (new path: './pointer' not './pointer-state')
- vendor/silvery/packages/ag-term/src/mouse-events.ts — import types from @silvery/headless
- vendor/silvery/packages/ag-term/src/semantic-copy.ts — import SelectionRange from @silvery/headless
- vendor/silvery/packages/ag-react/src/hooks/useTerminalSelection.tsx — import from @silvery/headless
- vendor/silvery/packages/ag-react/src/hooks/usePointerState.tsx — import from @silvery/headless
- vendor/silvery/packages/ag-react/src/hooks/useFind.tsx — import from @silvery/headless
- vendor/silvery/packages/ag-react/src/hooks/useCopyMode.tsx — import from @silvery/headless
- vendor/silvery/tests/pointer-state.test.ts — rename file? No — test file names don't need to match source names. Just update imports.
  - Actually: rename to pointer.test.ts for consistency. The test file name currently matches the source it tests.
- vendor/silvery/tests/selection.test.ts — update imports
- vendor/silvery/tests/selection-granularity.test.ts — update imports
- vendor/silvery/tests/find.test.ts — update imports
- vendor/silvery/tests/copy-mode.test.ts — update imports
- vendor/silvery/tests/copy-mode-advanced.test.ts — update imports

DELETE (in same commits as moves):

- vendor/silvery/packages/ag-term/src/selection.ts (old location)
- vendor/silvery/packages/ag-term/src/pointer-state.ts
- vendor/silvery/packages/ag-term/src/find.ts
- vendor/silvery/packages/ag-term/src/copy-mode.ts

## Delete section

Old file locations in ag-term. pointer-state.ts gets renamed to pointer.ts in the new location.

## New tests

None new. Existing tests update imports and pointer-state.test.ts → pointer.test.ts.

## Definition of Done

- [ ] 4 files moved (old deleted, new in place)
- [ ] pointer-state.ts renamed to pointer.ts in headless
- [ ] pointer-state.test.ts renamed to pointer.test.ts
- [ ] All imports updated to @silvery/headless
- [ ] ag-term/src/index.ts re-exports from @silvery/headless for convenience
- [ ] All existing tests pass in new locations
- [ ] tsc 0 new errors

## /complete criteria

Run literally:

- test ! -e vendor/silvery/packages/ag-term/src/selection.ts
- test ! -e vendor/silvery/packages/ag-term/src/pointer-state.ts
- test ! -e vendor/silvery/packages/ag-term/src/find.ts
- test ! -e vendor/silvery/packages/ag-term/src/copy-mode.ts
- test -f vendor/silvery/packages/headless/src/selection.ts
- test -f vendor/silvery/packages/headless/src/pointer.ts (RENAMED)
- test ! -e vendor/silvery/packages/headless/src/pointer-state.ts
- test -f vendor/silvery/packages/headless/src/find.ts
- test -f vendor/silvery/packages/headless/src/copy-mode.ts
- test -f vendor/silvery/tests/pointer.test.ts (renamed from pointer-state.test.ts)
- test ! -e vendor/silvery/tests/pointer-state.test.ts
- grep -r "from '\\./selection'\|from '\\./pointer-state'" vendor/silvery/packages/ag-term/src → 0 hits (except index.ts re-export)
- bun vitest run vendor/silvery/tests/selection.test.ts vendor/silvery/tests/find.test.ts vendor/silvery/tests/copy-mode.test.ts vendor/silvery/tests/pointer.test.ts → all pass
- cd vendor/silvery && npx tsc --noEmit 2>&1 | grep -c 'error TS' → no new errors vs baseline

## Naming rationale

Headless convention: flat, no suffix (readline.ts, select-list.ts). Don't add noise. 'pointer-state.ts' name is redundant — all state machines carry state. 'pointer.ts' is cleaner and matches the others.

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.

