---
mentions:
  - km
  - claude
id: "@km/inbox/flexx-stress-cache"
aliases:
  - km-flexx-stress-cache
  - "@km/_orphan/flexx-stress-cache"
created_at: 2026-01-31T14:03:35Z
closed_at: 2026-01-31T14:05:54Z
assignee: claude:b8b4780b
---

# [x] Add caching correctness stress tests @km/_orphan #task #P1 @claude:b8b4780b

Add stress tests for caching correctness before deprecating classic layout.ts.

Expert analysis identified these edge cases that can cause false cache hits:

## Test Cases Needed

### 1. Percent + Wrap Combinations

- Percent width/height with flex-wrap
- Percent margin/padding with wrap
- Nested percent values

### 2. Shrink-wrap + Min/Max

- Auto-sized parent with min/max constrained children
- Children whose intrinsic size changes
- Min/max constraints on shrink-wrap containers

### 3. Stretch + Aspect Ratio

- Cross-axis stretch with aspect-ratio
- Multi-line stretch behavior
- Stretch with min/max constraints

### 4. Baseline Alignment

- Baseline with different child heights
- Baseline after content changes
- Baseline with wrap

## Implementation

- Use differential testing: generate random style trees
- Compare outputs between fresh layout and cached layout
- Ensure identical results

## Success Criteria

- All stress tests pass
- No false cache hits detected
- Performance regression tests included

