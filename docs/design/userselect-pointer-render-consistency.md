# `userSelect` — pointer hit-test vs render-layer consistency

Status: design note / known-limitation writeup (2026-07-16)
Guard test: `packages/ag-react/tests/text-selection-drag-copy.test.tsx`
(`test.fails` "[known limitation] nested userSelect='text' does NOT yet re-arm
inside a 'none' ancestor").

## Summary

`userSelect` is resolved in **two** places, and they disagree on one case:

1. **Render layer** (`pipeline/render-phase.ts`): `selectableMode` is threaded
   top-down. `userSelect="none"` sets it false for the subtree; a nested
   `userSelect="text"|"contain"` sets it **back to true**. So the render layer
   already supports the DOM/CSS rule that a child `user-select: text` overrides
   a parent `user-select: none` — the child's cells are stamped selectable.

2. **Pointer hit-test** (`mouse-events.ts::selectionHitTestInner`, reached from
   `resolveSelectionAnchorFromPoint` on mousedown): the top-down walk does
   `if (resolveUserSelect(node) === "none") return null` at the first `none`
   node and never descends to the re-enabling child. So no selection drag is
   armed over that child — even though its cells are painted selectable.

Net effect: cells inside `userSelect="none"` > `userSelect="text"` render as
selectable but cannot be selected by mouse. The two layers must agree.

## Why it's not just the top guard

`selectionHitTestInner` bails on `none` in two spots:

- Top: `if (resolved === "none") return null` — blocks descent entirely.
- Child loop: `if (resolveUserSelect(child) === "none") return null` — returns
  null for the whole hit-test when a child under the point is `none`, rather
  than skipping just that child.

The outer `resolveSelectionAnchorFromPoint` gate is already correct for this
case: `pointerBlocksSelection` uses `resolveUserSelect(pointerTarget)` (a
**bottom-up** walk), which returns `"text"` for the inner box — so it does not
block. The inconsistency is purely the **top-down** `selectionHitTestInner`.

## Proposed fix (deferred — untested core, z-order subtleties)

Make a node's OWN content a hit only when `resolveUserSelect(node) !== "none"`,
but always descend into children so a re-enabling descendant can be hit:

```ts
function selectionHitTestInner(node, x, y, allowRowFallback) {
  const rect = node.scrollRect
  if (!rect || !pointInRect(x, y, rect)) return null
  const selfSelectable = resolveUserSelect(node) !== "none"
  const clips = node.props.overflow === "hidden" || node.props.overflow === "scroll"

  // Descend first — a descendant may re-enable selection.
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    const childRect = child.scrollRect
    if (clips && childRect && !pointInRect(x, y, rect)) continue
    const hit = selectionHitTestInner(child, x, y, false)
    if (hit) return hit
  }

  if (!selfSelectable) return null      // this node's own text is NOT a hit
  // …existing silvery-text / island / row-fallback branches…
}
```

### Why it's deferred, not shipped here

`selectionHitTestInner` / `resolveSelectionAnchorFromPoint` had **zero test
coverage** before this suite. Two behaviors need locking down before changing
the walk, because both are plausible and currently untested:

- **z-order / overlap:** the old child-loop `return null` blocked selecting text
  that sits *behind* a `userSelect="none"` element at the same point (correct
  per DOM — you don't select through an opaque no-select overlay). The naive
  rewrite lets the hit fall through to the text behind. The fix must preserve
  "topmost `none` at the point blocks" while still allowing a `none` *ancestor*
  with a `text` *child* to select.
- **`contain`:** boundary discovery (`findSelectionBoundaries`) interacts with
  the same walk and needs its own regression tests.

The fix is small but belongs in a change that also adds z-order + `contain`
hit-test tests, so the rewrite is guarded. This note + the `test.fails` pin
capture the gap executably.

## Consumer impact

None for the immediate driver (yrd `queue watch`): its selectable regions
(DETAIL body, step tabs, EVIDENCE, timeline `ListView` rows) are plain
`Box`/`Text`/`Tabs`/`Accordion`/`ListView` — none sit inside a
`userSelect="none"` ancestor, so drag-select already works there. This
limitation only affects the "re-enable selection inside an explicitly
non-selectable container" pattern, which no current consumer uses.
