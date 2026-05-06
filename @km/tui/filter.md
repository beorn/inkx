---
mentions:
  - km
  - claude
id: "@km/tui/filter"
aliases:
  - km-tui.filter
  - km-tui-filter
created_by: claude:5f0aee02
created_at: 2026-02-18T08:40:11Z
closed_at: 2026-02-19T19:00:05Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Filtering on all views (Ctrl+/) @km/tui #feature #P2 @claude:8f007ba9

Filter feature for all views:

**Keyboard shortcut**: Ctrl+/ (sends 0x1F in terminals — verify it works in Ghostty/inkx)
**Current impl**: backslash opens FilterDialog with text search — needs redesign

**Requirements (updated)**:

1. Ctrl+/ toggles filter dialog (not backslash)
2. Filter dialog appears in TOP-RIGHT corner (not center/bottom)
3. Filter status indicator in breadcrumbs bar (top-right), not bottom bar
4. Property-based filters with easy toggle (not just text search):
  - Task status (todo, wip, done, dropped) — checkboxes/toggles
  - Priority (P1-P4)
  - Due date (overdue, today, this week, no date)
  - Assigned to (list of assignees)
  - Tags/labels
  - Node color
  - Node type (task, note, heading, etc.)
5. Multiple filters can be active simultaneously (AND logic)
6. Filter state should persist across sessions
7. When dialog is closed but filters active, show compact status in breadcrumbs bar (e.g., 'F: status=todo,wip')

