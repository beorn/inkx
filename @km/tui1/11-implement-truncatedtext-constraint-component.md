---
id: "@km/tui1/11-implement-truncatedtext-constraint-component"
aliases:
  - km-tui1.11
  - km-tui1-11
  - "@km/tui1/11"
created_at: 2026-01-17T00:06:32Z
closed_at: 2026-01-17T20:18:01Z
---

# [x] Implement TruncatedText constraint component @km/tui1 #task #P1

## Summary

Implement the TruncatedText constraint component that uses context-provided width for ANSI-aware text truncation.

## Design Reference

See [inkx-legacy.3-design.md](.beads/inkx-legacy.3-design.md) for full specification.

## Implementation

**Location**: `apps/km-tui/packages/km-ink/src/constraints/TruncatedText.tsx`

**Props**:
```typescript
interface TruncatedTextProps {
  children: string;
  ellipsis?: string;      // Default: '…'
  maxLines?: number;      // Default: 1
  width?: number;         // Override context width
}
```

**Usage**:
```typescript
<TruncatedText maxLines={3}>{renderRich(node.title)}</TruncatedText>
```

**Implementation**:
- Get width from `useComputedSize()` hook
- Call existing `constrainText()` from layout module
- Render lines with Ink `<Text>` components

## Dependencies

- Requires: context.ts, hooks.ts from inkx-legacy.1 foundation
- Reuses: `constrainText()` from `layout/constrain.ts`
- Reuses: `displayLength()` from `text/rich.ts`

## Acceptance Criteria

- [ ] Gets width from context (no prop required)
- [ ] Supports width override prop
- [ ] Handles ANSI-styled content correctly
- [ ] Supports custom ellipsis
- [ ] Supports multi-line truncation
- [ ] Unit tests pass

## Blocked By

- inkx-legacy.1 (constraint system design approval)