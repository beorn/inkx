---
id: "@km/_orphan/console-status"
aliases:
  - km-console-status
created_at: 2026-02-01T23:34:42Z
closed_at: 2026-02-01T23:40:29Z
assignee: claude:b8b4780b
---

# [x] Console view: status bar indicator + fix log line styling @km/_orphan #feature #P2 @claude:b8b4780b

## Summary
The Console view (debug output panel) needs two improvements:

1. **Status bar indicator**: Show error/line count in bottom status bar (only when console has content)
2. **Log line styling**: Many log lines appear grey instead of properly styled - verify and fix

## Current Behavior
- Console shows debug output but no summary in status bar
- Some log line colors work, but many are just grey

## Expected Behavior
- Status bar shows indicator like `Console: 12 lines (3 errors)` **only when there are lines**
- Hidden/absent when console is empty
- All log lines should render with appropriate colors (errors=red, warnings=yellow, etc.)

## Files
- apps/@km/tui/src/views/ - Console view
- Status bar component

## Acceptance Criteria
- [ ] Status bar shows line count and error count (only when lines > 0)
- [ ] No indicator shown when console is empty
- [ ] Error lines are red
- [ ] Warning lines are yellow
- [ ] Info/debug lines have appropriate styling
- [ ] Grey-only rendering is fixed