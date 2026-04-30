---
id: "@km/inbox/flexx-aligncontent"
aliases:
  - km-flexx-aligncontent
  - "@km/_orphan/flexx-aligncontent"
created_at: 2026-01-30T15:24:33Z
closed_at: 2026-01-31T13:41:02Z
assignee: claude:b8b4780b
---

# [x] [flexx] Implement alignContent for wrapped layouts @km/_orphan #task #P1 @claude:b8b4780b

## Summary
AlignContent property is stored but not applied during layout. 5 failing tests.

## Implementation
Location: vendor/beorn-flexx/src/layout.ts - after computing line cross sizes

## Tests
- align-content-center, flex-end, space-between, space-around, stretch