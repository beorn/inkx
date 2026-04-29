---
id: "@km/tui1/16-refactor-treenode-to-use-constraint-components"
aliases:
  - km-tui1.16
  - km-tui1-16
  - "@km/tui1/16"
created_at: 2026-01-17T00:07:40Z
closed_at: 2026-01-17T20:35:59Z
---

# [x] Refactor TreeNode to use Constraint Components @km/tui1 #task #P2

## Summary

Analyzed TreeNode.tsx for potential Constraint Component refactoring.

## Findings

**FlexRow cannot be used for the main content line** because:
- The entire line needs consistent background color for selection highlighting
- FlexRow creates separate Box elements for each FlexItem
- Selection bg/fg colors must span the entire row as a single Text element

## Changes Made

1. Fixed `Node` → `KNode` type (was referencing browser DOM Node type)
2. Added comment noting future refactoring direction

## Why Limited Refactoring

The current pattern is optimal for Ink's selection model:
```tsx
<Text backgroundColor={bg} color={fg}>
  {prefix}{icon}{content}{suffix}{padding}
</Text>
```

Using FlexRow would break this into multiple elements, breaking selection highlighting.

## Future Enhancement

Consider adding a `HighlightedRow` component to the constraint system that:
- Takes children like FlexRow
- Renders as single Text with background color spanning full width
- Concatenates child content with proper spacing

This is tracked separately.

## Resolution

Closing as "won't fix" - the current implementation is correct for Ink's rendering model.
The FlexRow/TruncatedText components are useful for OTHER components, just not TreeNode's
main line rendering.