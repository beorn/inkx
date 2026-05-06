---
mentions:
  - km
  - claude
id: "@km/inbox/flexx-pct-nested"
aliases:
  - km-flexx-pct-nested
  - "@km/_orphan/flexx-pct-nested"
created_at: 2026-01-30T15:25:17Z
closed_at: 2026-01-30T18:47:57Z
assignee: claude:b8b4780b
---

# [x] [flexx] Fix nested percentage resolution @km/_orphan #bug #P3 @claude:b8b4780b

## Summary

Nested percentage dimensions resolve against incorrect reference size.

## Failing Test (1)

- percent-nested: Inner should be 25x25 (50% of 50) → actual 13x13

## Fix

Percentage dimensions should resolve against parent content box after layout.

## Complexity

Medium - less critical for TUI use cases

