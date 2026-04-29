---
id: "@km/_orphan/flexx-rtl"
aliases:
  - km-flexx-rtl
created_at: 2026-01-30T22:44:41Z
closed_at: 2026-01-30T22:58:38Z
assignee: claude:b8b4780b
---

# [x] Implement RTL (right-to-left) support in Flexx @km/_orphan #task #P2 @claude:b8b4780b

Add RTL direction support to match Yoga parity.

## What's needed
- Flip edge resolution (left↔right) when direction=RTL
- Swap EDGE_START/EDGE_END meanings based on direction
- Reverse child iteration order for row layouts in RTL
- Thread direction parameter through resolveEdgeValue and layoutNode

## Scope
- ~150-250 lines across layout.ts and utils.ts
- Constants already exist (DIRECTION_RTL), just ignored
- Estimated: 1-2 days

## Acceptance
- Yoga RTL tests pass
- Docs updated to show RTL as ✅