---
id: "@km/_orphan/7kdf"
aliases:
  - km-7kdf
created_at: 2026-01-20T07:44:23Z
closed_at: 2026-01-20T13:28:55Z
---

# [x] Flexx: Refactor node.ts god object @km/_orphan #task #P2

## Problem
`vendor/beorn-flexx/src/node.ts` is 1006 lines with a single Node class handling:
- Tree operations (lines 46-90)
- Measure function management (lines 93-108)
- Dirty tracking (lines 110-131)
- Layout calculation (lines 133-151)
- 40+ property setters (lines 194-396)
- Utility functions (lines 399-1006)

## Proposed structure
```
src/
├── node.ts              # Core Node class (tree ops, measure, dirty)
├── layout-algorithm.ts  # Layout computation logic
└── helpers.ts           # Edge/border utilities
```

## Files affected
~5 files (node.ts split + test updates)