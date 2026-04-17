# useBoxMetrics Parity Analysis & Design

**Bead**: km-silvery.boxmetrics-parity
**Date**: 2026-04-09

## Current state

### Silvery's layout hooks (vendor/silvery/packages/ag-react/src/hooks/useLayout.ts)

```typescript
// Component-internal — reads from NodeContext
useBoxRect(): Rect                    // { x, y, width, height }
useScreenRect(): Rect                     // with scroll offsets
usescreenRect(): Rect                     // with sticky offsets

// Zero-rerender callbacks
useBoxRect(cb: (rect: Rect) => void): void
useScreenRect(cb: (rect: Rect) => void): void
useScreenRect(cb: (rect: Rect) => void): void
```

### Ink 7.0's hook

```typescript
// Ref-based
useBoxMetrics(ref: RefObject<DOMElement>): BoxMetrics & { hasMeasured: boolean }
// BoxMetrics = { width, height, left, top }
```

## Key differences

| Feature                     | Silvery                          | Ink                                         |
| --------------------------- | -------------------------------- | ------------------------------------------- |
| **Invocation**              | Component-internal (NodeContext) | `useBoxMetrics(ref)`                        |
| **Shape**                   | `{ x, y, width, height }`        | `{ width, height, left, top, hasMeasured }` |
| **Position semantics**      | Absolute in content space        | Parent-relative (getComputedLayout)         |
| **hasMeasured flag**        | Missing                          | Yes                                         |
| **Field name for position** | `x, y`                           | `left, top`                                 |
| **Scroll-aware**            | useScreenRect yes                | No (Ink has no scroll)                      |
| **Sticky-aware**            | usescreenRect yes                | No                                          |
| **Zero-rerender variant**   | Yes (`*Callback`)                | No                                          |
| **Resize subscription**     | Via pipeline layoutSubscribers   | Explicit stdout.on('resize')                |
| **Subtree-level re-render** | Yes (node.layoutSubscribers)     | Yes (addLayoutListener on root)             |

## Ink's advantages

1. **Ref-based** — works with any component that forwards a ref, not just silvery components that use NodeContext
2. **hasMeasured** — explicit first-render signal (useful for showing "Loading..." vs real values)
3. **Left/top naming** — matches CSS idiom more than x/y

## Silvery's advantages

1. **useScreenRect + usescreenRect** — scroll-aware and sticky-aware variants. Ink can't implement these without scroll containers.
2. **Zero-rerender callback variants** — critical for hit-testing large lists without re-rendering on every layout change
3. **No ref required** — cleaner for components that already own a silvery node

## Design decision

**Adopt Ink's API as an additional hook, keep silvery's API for internal use.**

### Plan

1. **Add `useBoxMetrics(ref?)` as a new hook**
   - With ref: ref-based (compat with Ink)
   - Without ref: uses NodeContext (silvery idiom)
   - Returns `{ width, height, left, top, hasMeasured }`
   - Derives left/top from parent-relative position (boxRect.x - parent.boxRect.x)

2. **Add `hasMeasured` to the return type**
   - Also add to useBoxRect / useScreenRect / usescreenRect as optional extension
   - Pre-first-render: `hasMeasured: false`, width/height = 0
   - Post-layout: `hasMeasured: true`, real values

3. **Keep useBoxRect + useScreenRect + usescreenRect**
   - They're not redundant — useScreenRect and usescreenRect are unique silvery features
   - Don't rename them — silvery's model is richer than Ink's
   - But document useBoxMetrics as the "Ink-compatible" entry point

4. **Migration guide update**

   ```tsx
   // Ink code — works as-is after switching import
   import { useBoxMetrics } from "silvery"
   const ref = useRef(null)
   const { width, height, left, top, hasMeasured } = useBoxMetrics(ref)

   // Or silvery idiom (no ref required)
   const { width, height } = useBoxMetrics()
   ```

5. **Export from barrel**
   - `silvery/hooks` subpath export
   - `silvery` main barrel

## Implementation sketch

```typescript
// vendor/silvery/packages/ag-react/src/hooks/useBoxMetrics.ts
import { useContext, useLayoutEffect, useReducer, type RefObject } from "react"
import { NodeContext } from "../context"
import type { AgNode } from "@silvery/ag/types"

export interface BoxMetrics {
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
  readonly hasMeasured: boolean
}

const emptyMetrics: BoxMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0,
  hasMeasured: false,
}

export function useBoxMetrics(ref?: RefObject<AgNode | null>): BoxMetrics {
  const contextNode = useContext(NodeContext)
  const node = ref?.current ?? contextNode
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useLayoutEffect(() => {
    if (!node) return
    node.layoutSubscribers.add(forceUpdate)
    return () => {
      node.layoutSubscribers.delete(forceUpdate)
    }
  }, [node])

  if (!node?.boxRect) return emptyMetrics

  // Parent-relative position (matches Ink semantics)
  const parentRect = node.parent?.boxRect
  return {
    width: node.boxRect.width,
    height: node.boxRect.height,
    left: parentRect ? node.boxRect.x - parentRect.x : node.boxRect.x,
    top: parentRect ? node.boxRect.y - parentRect.y : node.boxRect.y,
    hasMeasured: true,
  }
}
```

## Open questions

1. **Do we expose AgNode refs?** Currently silvery doesn't have a ref mechanism like Ink's `ref={someRef}`. If we want ref-based useBoxMetrics, we need to add forwardRef support to Box/Text.
   - **Decision**: Start without ref support (just NodeContext). Add ref support when migrating from Ink is actually needed. That's a separate, bigger change.

2. **Should we update useBoxRect to include hasMeasured?**
   - Pro: Consistent API
   - Con: Breaking change for callers expecting just Rect
   - **Decision**: Add as optional property via type extension, non-breaking

## Effort

- Core hook: 2-4 hours
- Tests: 1-2 hours
- Docs + migration guide: 1 hour
- **Total: ~half day**

## Verification

- Existing useBoxRect tests still pass
- New useBoxMetrics tests cover hasMeasured, ref/no-ref paths
- Example: port an Ink useBoxMetrics example unchanged
- Migration doc shows before/after for Ink users
