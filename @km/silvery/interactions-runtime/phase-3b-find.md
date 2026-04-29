---
id: "@km/silvery/interactions-runtime/phase-3b-find"
aliases:
  - km-silvery.interactions-runtime.phase-3b-find
  - km-silvery-interactions-runtime-phase-3b-find
created_by: Bjørn Stabell
created_at: 2026-04-06T07:06:58Z
closed_at: 2026-04-06T08:56:38Z
close_reason: FindFeature service (find-feature.ts), FIND_CAPABILITY, withFocus
  extended with Ctrl+F/Escape, 34 tests. Silvery commit d100bbb.
---

# [x] Phase 3b: Extend withFocus for find (Ctrl+F) @km/silvery #task #P1

Now that Phase 3 validated the architecture (input-router + features/ subfolder + selection.ts), port find support. Find uses the same router for keyboard priority and the same features/ subfolder convention.

## Scope

Extend withFocus() to:
1. Create FindFeature via createFindFeature() (new: features/find.ts)
2. Register Ctrl+F key handler with input-router at priority 200
3. Register find bar overlay with router at z-order priority 50 (below selection)
4. OPTIONALLY call app.selection?.setRange when Enter sets selection to current match — soft dep, graceful degradation

## Files

CREATE:
- vendor/silvery/packages/ag-term/src/features/find.ts — FindFeature service
- vendor/silvery/tests/features/find.integration.test.ts — basic find + navigation
- vendor/silvery/tests/features/find-selection-sync.integration.test.ts — Enter syncs to selection when present
- vendor/silvery/tests/features/find-no-selection.integration.test.ts — graceful when selection missing

UPDATE:
- vendor/silvery/packages/create/src/with-focus.ts (+~80 lines)
- vendor/silvery/packages/ag-term/src/features/index.ts — add find export
- vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts — register find overlay via router

## Services

  interface FindFeature {
    state: Observable<FindState>
    search(query: string): void
    next(): void
    prev(): void
    selectCurrent(): void  // soft dep on selection
    close(): void
  }

## Delete

Nothing.

## New tests

3 integration tests in vendor/silvery/tests/features/.

## /complete criteria

- test -f vendor/silvery/packages/ag-term/src/features/find.ts
- grep -q 'find\|Ctrl' vendor/silvery/packages/create/src/with-focus.ts
- test -f vendor/silvery/tests/features/find.integration.test.ts
- test -f vendor/silvery/tests/features/find-selection-sync.integration.test.ts
- test -f vendor/silvery/tests/features/find-no-selection.integration.test.ts
- bun vitest run vendor/silvery/tests/features/find*.integration.test.ts → all pass
- bun vitest run vendor/silvery → full suite passes
- MANUAL: demo find bar appears on Ctrl+F, navigation works, Enter selects match

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.