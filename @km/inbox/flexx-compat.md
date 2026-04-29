---
id: "@km/_orphan/flexx-compat"
aliases:
  - km-flexx-compat
created_at: 2026-01-30T18:17:57Z
closed_at: 2026-01-30T20:51:54Z
assignee: claude:b8b4780b
---

# [x] [flexx] Yoga Compatibility - All Remaining Work @km/_orphan #epic #P1 @claude:b8b4780b

# Flexx Yoga Compatibility

Master bead tracking all remaining Flexx compatibility work.

## Current Status
- Test Coverage: 261/518 (50%) Yoga tests passing (excluding 42 AspectRatio)
- inkx layout-equivalence: 35/41 passing (6 skipped for known differences)
- Flexx is ~2.4x slower than Yoga (down from 3.4x after layout caching)

## Outstanding Work

### P1 - High Priority

1. **alignContent for wrapped layouts** (@km/_orphan/flexture-aligncontent)
   - 5 failing tests
   - Required for proper multi-line flex layouts

2. **Separate measure from layout phase** (@km/_orphan/flexture-measure-phase)
   - Performance optimization
   - Would allow better caching strategies

### P2 - Medium Priority

3. **wrap-reverse cross-axis positioning** (@km/_orphan/flexture-wraprev)
   - Lines should position from bottom, not top
   - Debug script: `bench/wrap-reverse-debug.ts`

4. **column-reverse layout** (@km/_orphan/flexture-colrev)
   - Negative array size issue

5. **Auto margin centering for absolute children** (@km/_orphan/flexture-abs-auto-margin)
   - Absolute children with auto margins should center

6. **Eliminate allocations in hot paths** (@km/_orphan/flexture-alloc-hot)
   - Profile and reduce GC pressure

### P3 - Lower Priority

7. **Nested percentage resolution** (@km/_orphan/flexture-pct-nested)
   - Percentages in nested containers

## Key Technical Notes

### Rounding Strategy (from plan file)
- Yoga rounds POSITIONS (edges), derives sizes from difference
- `width = round(end_edge) - round(start_edge)`
- This ensures adjacent elements share exact boundaries

### Flex Shrink Weighting
- Weight by flex-basis: `shrink_amount[i] = (flex_shrink[i] * flex_basis[i]) / sum(...)`

### Min/Max Constraint Order
- Clamp by min/max BEFORE flex distribution, not after

## Commands
```bash
# Run flexx tests
bun test vendor/beorn-flexx/tests/yoga/

# Run specific category
bun test vendor/beorn-flexx/tests/yoga/implemented/rounding.test.ts

# Profile
bun vendor/beorn-flexx/bench/profile.ts

# Debug wrap-reverse
bun vendor/beorn-flexx/bench/wrap-reverse-debug.ts
```