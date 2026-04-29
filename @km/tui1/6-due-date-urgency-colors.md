---
id: "@km/tui1/6-due-date-urgency-colors"
aliases:
  - km-tui1.6
  - km-tui1-6
  - "@km/tui1/6"
created_at: 2026-01-16T23:46:22Z
closed_at: 2026-01-17T00:36:37Z
---

# [x] Due date urgency colors @km/tui1 #feature #P2

Implement due date urgency styling to visually distinguish overdue and upcoming items.

## Specification

| Condition | Styling |
|-----------|---------|
| Overdue | Red text |
| Due within 3 days | Underlined |
| Future | Normal |

## Implementation

Use the existing date parsing and add conditional styling in the render pipeline.

## Files

- apps/@km/tui/packages/@km/_orphan/ink/src/text/format.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/text/colors.ts

## Note

This is shared with @km/tui2/20-implement-due-date-urgency-colors for TUI2.