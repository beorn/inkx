---
id: "@km/silvery/interactions-runtime/phase-31-useselection"
aliases:
  - km-silvery.interactions-runtime.phase-31-useselection
  - km-silvery-interactions-runtime-phase-31-useselection
created_by: Bjørn Stabell
created_at: 2026-04-06T07:23:05Z
closed_at: 2026-04-06T09:01:06Z
close_reason: useSelection hook with CapabilityRegistryContext bridge,
  Symbol.for() for cross-package identity, demo rewritten with real selection. 4
  tests. Silvery commit 08abb69.
owner: bjorn@stabell.org
---

# [x] Phase 3.1: useSelection hook + demo validation @km/silvery #task #P1

Add the read-only useSelection() hook so Phase 3's demo validation can use it. Moved from Phase 4 per Pro review 2 item 3: Phase 3's demo rewrite needs useSelection, so the hook must land with (or immediately after) the selection feature.

## Scope

- Create useSelection() hook
- Rewrite the demo to use real selection + useSelection
- Manual verification: demo works end-to-end
- Manual verification: km help dialog works (zero km code changes)

Other observer hooks (useFindState, useCopyModeState, useDragState) stay in Phase 4 and are added only when their features exist.

## Files

CREATE:
- vendor/silvery/packages/ag-react/src/hooks/useSelection.ts (~30 lines)
- vendor/silvery/tests/hooks/useSelection.test.tsx — returns undefined when feature missing, returns state when installed, updates reactively

UPDATE:
- vendor/silvery/packages/ag-react/src/hooks/index.ts — export useSelection
- vendor/silvery/packages/ag-react/src/exports.ts — export useSelection
- vendor/silvery/examples/apps/text-selection-demo.tsx — rewrite (delete fake useInput state, use real userSelect props + useSelection for copy indicator)

## Hook API (Pro review 2 item 6: undefined vs null distinction)

  function useSelection(): TerminalSelectionState | undefined

Returns:
- undefined when the selection feature is not registered as a capability (feature missing)
- state object with range=null when feature is installed, no active selection
- state object with range={...} when active

Consumers distinguish missing feature from idle:

  const selection = useSelection()
  if (selection === undefined) return null  // feature not installed
  if (!selection.range) return null  // no active selection
  // ...

Reads from the capability registry (added in Phase 2.5) via app context, looking up the SELECTION symbol.

## Delete

Nothing.

## New tests

1. useSelection.test.tsx:
   - returns undefined when withDomEvents is mounted WITHOUT selection
   - returns state (range=null) when mounted WITH selection, idle
   - returns state (range={...}) after mouse drag
   - re-renders when state changes

## Definition of Done

- [ ] useSelection.ts exists, ~30 lines
- [ ] Exported from hooks barrel
- [ ] 4 test cases pass
- [ ] Demo rewritten, no useInput-based fake state
- [ ] MANUAL: bun vendor/silvery/examples/apps/text-selection-demo.tsx → mouse-drag selects text
- [ ] MANUAL: km help dialog selection works with zero km changes

## /complete criteria

- test -f vendor/silvery/packages/ag-react/src/hooks/useSelection.ts
- grep -q 'useSelection' vendor/silvery/packages/ag-react/src/hooks/index.ts
- test -f vendor/silvery/tests/hooks/useSelection.test.tsx
- bun vitest run vendor/silvery/tests/hooks/useSelection.test.tsx → pass
- grep -q 'useSelection' vendor/silvery/examples/apps/text-selection-demo.tsx
- grep -c 'useInput' vendor/silvery/examples/apps/text-selection-demo.tsx → 0 or 1 (only for quit key, not fake state)
- MANUAL: demo mouse-drag highlights text (smoke test in real terminal)
- MANUAL: km help dialog highlights text (smoke test)

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.