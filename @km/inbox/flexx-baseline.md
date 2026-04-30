---
id: "@km/inbox/flexx-baseline"
aliases:
  - km-flexx-baseline
  - "@km/_orphan/flexx-baseline"
created_at: 2026-01-30T22:44:49Z
closed_at: 2026-01-30T23:02:53Z
assignee: claude:b8b4780b
---

# [x] Complete baseline alignment in Flexx @km/_orphan #task #P3 @claude:b8b4780b

Complete baseline alignment support (currently 80% done).

## Current state
- Basic baseline alignment exists (lines 818-858 in layout.ts)
- Uses bottom of margin box as fallback baseline
- Works for most cases

## What's needed
- Measure functions should return actual text baseline offset
- Propagate child's baseline up the tree
- ~50-100 lines to complete

## Scope
- Lower priority than RTL (fallback works for most TUI cases)
- True baseline matters mainly for mixed text sizes on same line
- Estimated: 0.5-1 day

## Acceptance
- Yoga baseline tests pass
- Docs updated to show baseline as ✅