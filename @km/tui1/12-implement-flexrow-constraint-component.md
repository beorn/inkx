---
mentions:
  - km
id: "@km/tui1/12-implement-flexrow-constraint-component"
aliases:
  - km-tui1.12
  - km-tui1-12
  - "@km/tui1/12"
created_at: 2026-01-17T00:06:43Z
closed_at: 2026-01-17T20:18:01Z
---

# [x] Implement FlexRow constraint component @km/tui1 #task #P1

## Summary

Implement the FlexRow/FlexItem constraint components for horizontal space distribution with integer math.

## Design Reference

See [inkx-legacy.3-design.md](.beads/inkx-legacy.3-design.md) for full specification.

## Implementation

**Location**: `apps/km-tui/packages/km-ink/src/constraints/FlexRow.tsx`

**FlexRow Props**:

```typescript
interface FlexRowProps {
  children: React.ReactNode;
  gap?: number;
}
```

**FlexItem Props**:

```typescript
interface FlexItemProps {
  flex?: number;       // Flex grow factor (default 0 for fixed, 1 for flex)
  width?: number;      // Fixed width (takes precedence over flex)
  minWidth?: number;   // Minimum width
  maxWidth?: number;   // Maximum width
  children: React.ReactNode;
}
```

**Usage**:

```typescript
<FlexRow gap={1}>
  <FlexItem width={10}><Prefix /></FlexItem>
  <FlexItem flex={2}><Title /></FlexItem>
  <FlexItem flex={1}><Status /></FlexItem>
</FlexRow>
```

## Algorithm: distributeSpace

Three-pass integer distribution:

1. **Pass 1**: Allocate fixed widths, sum flex factors
2. **Pass 2**: Distribute remaining space proportionally (integer division)
3. **Pass 3**: Distribute remainder to first N flex items (1 char each)

```typescript
function distributeSpace(
  total: number,
  configs: FlexItemConfig[],
  gap: number
): number[]
```

**Key**: Uses integer math only - no floats - to avoid 1-character gaps.

## Dependencies

- Requires: ConstraintContext from context.ts
- Provides: Computed widths via context to children

## Acceptance Criteria

- [ ] Distributes space using integer math (no gaps)
- [ ] Respects fixed width items
- [ ] Handles flex proportions correctly
- [ ] Applies min/max constraints
- [ ] Provides computed width to children via context
- [ ] Unit tests for distributeSpace algorithm

## Blocked By

- inkx-legacy.1 (constraint system design approval)

