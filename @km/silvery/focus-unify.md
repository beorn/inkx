---
id: "@km/silvery/focus-unify"
aliases:
  - km-silvery.focus-unify
  - km-silvery-focus-unify
created_by: Bjørn Stabell
created_at: 2026-04-09T14:56:04Z
closed_at: 2026-04-09T15:34:59Z
close_reason: "Easy steps done. Steps 1-2: useFocus(options) hook +
  HookFocusable in FocusManager (d7e33351). Step 3: ink-hooks.ts deprecated with
  note pointing to native useFocus. Step 6: 7 tests (c8157ed7). Step 7:
  event-handling.md Focus Management section + focus-parity status update
  (9fcbe681). Remaining Step 5 (delete InkFocusContext, rewire ink-render.ts) is
  multi-day — tracked in km-silvery.focus epic (P0)."
---

# [x] Unify focus systems — eliminate parallel ink-compat implementation @km/silvery #task #P1 @Bjørn Stabell

## Problem

Silvery currently has TWO separate focus implementations:

1. **@silvery/ink** (vendor/silvery/packages/ink/with-ink-focus.ts + ink-hooks.ts)
   - Full Ink port using React useState
   - Own InkFocusContext + InkFocusProvider
   - Tab navigation via raw escape sequences
   - Exports: useFocus(options), useFocusManager()
   - NOT integrated with FocusManager

2. **@silvery/ag-react** (vendor/silvery/packages/ag-react/src/hooks/useFocusable.ts)
   - Native FocusManager-backed
   - Scopes, spatial nav, focus origin, useFocusWithin
   - Reads testID/autoFocus from Box props
   - Exports: useFocusable() (no args), useFocusManager()

## Why this is bad

- Duplicate implementations to maintain
- Bug fix divergence risk
- Ink compat layer doesn't get silvery's superior capabilities (scopes, spatial nav, origin tracking)
- Users importing from silvery/ink get a different runtime than silvery native

## Solution

Unify on the native FocusManager:

1. **Add useFocus(options) to @silvery/ag-react** — thin wrapper around useFocusable + FocusManager. Matches Ink's signature exactly. Returns { isFocused, focus }.
2. **Add isActive option support** — temporarily disable focus without losing tab position.
3. **Update @silvery/ink/useFocus to re-export** from ag-react instead of its own implementation.
4. **Delete InkFocusContext + InkFocusProvider** — the parallel system.
5. **withInkFocus() becomes alias for withFocus()** — single provider.
6. **Add isFocused alongside focused** in useFocusable return (or rename for v1.0).

## Acceptance Criteria

- [ ] @silvery/ag-react exports useFocus(options) hook matching Ink's signature
- [ ] isActive option works (deactivate without unregistering)
- [ ] @silvery/ink/useFocus is a re-export, not a separate implementation
- [ ] InkFocusContext + InkFocusProvider deleted
- [ ] withInkFocus() = withFocus()
- [ ] grep "InkFocusContext" → 0 hits in source
- [ ] All ink compat tests pass
- [ ] All silvery focus tests pass
- [ ] Ink compatibility verified (port an Ink useFocus example)

## Effort

~1 day (single agent, single worktree)

## Why P1

Should ship before silvery v1.0. After unification, silvery has ONE focus story that's strictly better than Ink AND ergonomically compatible. This is a competitive moat.