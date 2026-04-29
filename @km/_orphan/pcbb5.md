---
id: "@km/_orphan/pcbb5"
aliases:
  - km-pcbb5
created_at: 2026-01-31T12:23:30Z
closed_at: 2026-01-31T12:37:47Z
---

# [x] Implement constraint fingerprinting for Zero-alloc @km/_orphan #task #P1 @claude:b8b4780b

# Constraint Fingerprinting

Skip unchanged subtrees during re-layout by tracking constraint fingerprints.

## Approach
1. Add fingerprint fields to FlexInfo: lastAvailW, lastAvailH, lastDir
2. At start of layoutNode, check if fingerprint matches and node not dirty
3. If match, skip layout and reuse cached layout.left/top/width/height
4. Handle edge cases:
   - Shrink-wrap nodes (auto-sized) cannot skip - they affect parent
   - Percent values must re-resolve if parent changed
   - Dirty flag must propagate up to root

## Expected Impact
- 2-10x faster for incremental TUI updates
- Most TUI re-renders only change small portions of tree

## Files to Modify
- src/types.ts - Add fingerprint fields to FlexInfo
- src/node-zero.ts - Initialize fingerprint fields
- src/layout-zero.ts - Add fingerprint check at layoutNode start