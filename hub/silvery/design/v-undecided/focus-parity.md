# Focus Parity Analysis & Design

**Bead**: km-silvery.focus-parity
**Date**: 2026-04-09
**Status**: PARTIALLY SHIPPED 2026-04-09

Steps 1-2 shipped: `useFocus(options)` hook in `@silvery/ag-react` (commit d7e33351)

- HookFocusable in FocusManager + 7 tests (commit c8157ed7).
  Steps 3-5 (delete InkFocusContext parallel impl) tracked in km-silvery.focus-unify.
  Docs updated in event-handling.md.

## Current state

### Silvery's focus hooks (vendor/silvery/packages/ag-react/src/hooks/)

```typescript
// No-args, reads testID + autoFocus from component's node props
useFocusable(): UseFocusableResult
// Returns: { focused, focusOrigin, focus, blur }

// Returns focus state + control methods
useFocusManager(): UseFocusManagerResult

// Parent-level "any descendant focused" check
useFocusWithin(): boolean
```

### Ink 7.0's hooks

```typescript
useFocus(options?: {
  isActive?: boolean
  autoFocus?: boolean
  id?: string
}): { isFocused: boolean, focus: (id: string) => void }

useFocusManager(): {
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
  activeId: string | undefined
}
```

## Key differences

| Feature                   | Silvery                           | Ink                                   |
| ------------------------- | --------------------------------- | ------------------------------------- |
| **Hook name**             | useFocusable                      | useFocus                              |
| **Options arg**           | No — reads from node props        | Yes — options object                  |
| **id/testID**             | `testID` prop on Box              | `id` in options                       |
| **autoFocus**             | Prop on Box                       | Options arg                           |
| **isActive**              | Missing                           | Yes (disable without losing position) |
| **Return field name**     | `focused`                         | `isFocused`                           |
| **Focus origin tracking** | Yes (keyboard/mouse/programmatic) | No                                    |
| **useFocusWithin**        | Yes (parent-level)                | No                                    |
| **Focus scopes**          | Yes (withFocus provider)          | No                                    |

## Ink's advantages

1. **Hook name**: `useFocus` is shorter, more conventional
2. **Options in hook call**: More React-idiomatic than reading from node props
3. **isActive flag**: Temporarily disable focusability without losing tab order
4. **activeId**: Direct access to currently focused component ID

## Silvery's advantages

1. **useFocusWithin**: Parent component can know if any descendant is focused (no Ink equivalent)
2. **Focus origin tracking**: Know if focus came from keyboard, mouse, or programmatic
3. **Focus scopes**: `withFocus()` provider enables nested focus scopes (modals, dialogs)
4. **InputLayerProvider integration**: Focus management integrates with Ctrl+F find, Esc+v copy mode
5. **Focus features beyond navigation**: FindFeature, CopyModeFeature built on same system

## Design decision

**Add `useFocus` as a new hook matching Ink's API. Keep useFocusable for internal use but mark as "silvery-specific".**

### Plan

1. **Add `useFocus(options?)` hook**
   - Matches Ink's signature exactly
   - Returns `{ isFocused, focus }` (Ink-compatible shape)
   - Internally uses the same FocusManager as useFocusable
   - When `id` provided, stores on the node (overrides testID)
   - When `autoFocus: true`, triggers focus on mount
   - When `isActive: false`, disables this component's focus target

2. **Keep useFocusable as internal hook**
   - Used by components that need focus origin tracking
   - Used by internals that need scope-aware behavior
   - Not removed — different use case (richer return)

3. **Add `activeId` to useFocusManager return**
   - Matches Ink's API
   - Trivial — it's already in the snapshot

4. **Add `enableFocus` / `disableFocus` to useFocusManager**
   - These match Ink's global focus toggle
   - Silvery should support this for parity

5. **The ink-hooks.ts compat layer already has `useFocus`**
   - `vendor/silvery/packages/ink/src/ink-hooks.ts:22`
   - Verify it matches Ink 7.0 signature
   - Move to public hooks (not just ink compat) — it's a good API

## Implementation sketch

```typescript
// vendor/silvery/packages/ag-react/src/hooks/useFocus.ts
import { useContext, useEffect } from "react"
import { FocusManagerContext, NodeContext } from "../context"
import { useSyncExternalStore } from "react"

export interface UseFocusOptions {
  isActive?: boolean
  autoFocus?: boolean
  id?: string
}

export interface UseFocusResult {
  isFocused: boolean
  focus: (id: string) => void
}

export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)
  const { isActive = true, autoFocus = false, id } = options

  // Use options.id if provided, otherwise fall back to node's testID
  const focusId = id ?? (node?.props as any)?.testID ?? null

  // Subscribe to focus state
  const snapshot = useSyncExternalStore(
    fm?.subscribe.bind(fm) ?? (() => () => {}),
    () => fm?.getSnapshot() ?? null,
    () => fm?.getSnapshot() ?? null,
  )

  const isFocused = isActive && focusId !== null && snapshot?.activeId === focusId

  // Register as focusable if isActive
  useEffect(() => {
    if (!fm || !node || !isActive || !focusId) return
    fm.register(focusId, node)
    return () => {
      fm.unregister(focusId)
    }
  }, [fm, node, isActive, focusId])

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && fm && focusId) {
      fm.focus(focusId)
    }
  }, [autoFocus, focusId, fm])

  return {
    isFocused,
    focus: (targetId: string) => fm?.focus(targetId),
  }
}
```

## Effort

- useFocus hook: 3-4 hours (needs FocusManager.register/unregister methods)
- useFocusManager.activeId + enableFocus/disableFocus: 1-2 hours
- Tests: 2-3 hours
- Docs: 1 hour
- **Total: ~1 day**

## Verification

- Existing useFocusable tests pass
- New useFocus tests cover id/autoFocus/isActive matrix
- Port Ink useFocus examples to silvery — should work unchanged
- Migration doc: before/after for Ink users
