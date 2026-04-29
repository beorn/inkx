---
id: "@km/_orphan/vsv6l"
aliases:
  - km-vsv6l
created_at: 2026-01-31T12:38:04Z
closed_at: 2026-01-31T12:41:30Z
assignee: claude:b8b4780b
---

# [x] Port RTL support to Zero-alloc @km/_orphan #task #P2 @claude:b8b4780b

# Port RTL Support to Zero-alloc

Port right-to-left (RTL) layout support from Classic to Zero-alloc algorithm.

## Scope
- ~69 direction references in Classic algorithm
- DIRECTION_RTL enum already exists
- Need to handle:
  - Main axis direction reversal
  - Edge resolution (left/right swap)
  - Start/End logical edges

## Files
- src/layout-zero.ts - Add RTL handling
- Tests should pass with DIRECTION_RTL

## Reference
- src/layout.ts - Classic implementation has full RTL