---
mentions:
  - km
id: "@km/inbox/ccsw"
aliases:
  - km-ccsw
  - "@km/_orphan/ccsw"
created_at: 2026-01-22T15:37:05Z
closed_at: 2026-01-22T15:47:51Z
---

# [x] Add ref support to inkx and adopt across km codebase @km/_orphan #feature #P2

## Summary

Add full ref support to inkx (forwardRef on Box/Text, TypeScript types) and refactor @km/tui to use refs where it simplifies the code.

## Background

inkx has partial ref support - HostConfig's `getPublicInstance` already returns InkxNode - but Box/Text don't expose ref props. Ink supports refs (PR #330), primarily for `measureElement()`.

## Key Design Decision: Keep onLayout + Add Refs

**onLayout and refs are complementary, not competing:**

| Pattern  | When to Use                                                                     |
| -------- | ------------------------------------------------------------------------------- |
| onLayout | Reactive - auto-triggers on layout change, good for re-renders and side effects |
| refs     | Imperative - query on demand, good for one-time reads and imperative operations |

onLayout is a valuable feature (React DOM doesn't have it built-in - you need ResizeObserver). We're adding refs as an additional tool, not replacing onLayout.

## Implementation

### Phase 1: inkx Core Changes

1. **Wrap Box/Text with forwardRef** (`vendor/beorn-inkx/src/components/`)

```typescript
export const Box = forwardRef<InkxNode, BoxProps>((props, ref) => {
  const { children, ...restProps } = props;
  return <inkx-box ref={ref} {...restProps}>{children}</inkx-box>;
});
```

2. **Update TypeScript types** - Add `ref?: React.Ref<InkxNode>` to BoxProps/TextProps
3. **Add measureElement() helper** - Convenience function matching Ink's API

```typescript
export function measureElement(node: InkxNode): { width: number; height: number } {
  return {
    width: node.computedLayout?.width ?? 0,
    height: node.computedLayout?.height ?? 0,
  };
}
```

### Phase 2: @km/tui Refactoring

1. **Replace CardPositionRegistry singleton** (`apps/km-tui/packages/km-ink/src/card-positions.ts`)
- Convert global singleton to context + ref pattern
- Cleaner lifecycle management
5. **Review patterns - keep onLayout where reactive, use refs where imperative:**
- `CardColumn.tsx` prevY tracking - likely keep onLayout (needs reactive updates)
- One-time measurements - use refs + measureElement()
- Scroll position queries - refs may be cleaner than prop drilling
10. **Consider focus stack** (optional, may be separate bead)
- Replace manual `useInput` gating in `Board.tsx`
- Auto-route input to topmost focused component

### Phase 3: Documentation

1. **Update `docs/dev/ink-patterns.md`** - Add section on refs vs onLayout guidance
2. **Update inkx README** (if exists) - Document ref API
3. **Add JSDoc to new exports** - measureElement, updated Box/Text

## Acceptance Criteria

- [ ] Box and Text support refs via forwardRef
- [ ] TypeScript types include ref prop
- [ ] measureElement() helper exported from inkx
- [ ] CardPositionRegistry refactored to use context + ref
- [ ] Documentation includes guidance on refs vs onLayout
- [ ] All tests pass (`bun run test:all`)

## Files to Modify

**inkx:**

- `vendor/beorn-inkx/src/components/Box.tsx`
- `vendor/beorn-inkx/src/components/Text.tsx`
- `vendor/beorn-inkx/src/types.ts` (if needed for exports)
- `vendor/beorn-inkx/src/index.ts` (export measureElement)

**@km/tui:**

- `apps/km-tui/packages/km-ink/src/card-positions.ts`
- Components as needed after review

**docs:**

- `docs/dev/ink-patterns.md`

## References

- Plan file: `~/.claude/plans/iterative-floating-lampson.md`
- Ink PR #330: https://github.com/vadimdemedes/ink/pull/330

