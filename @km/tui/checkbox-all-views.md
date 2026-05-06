---
mentions:
  - km
  - Bjørn
id: "@km/tui/checkbox-all-views"
aliases:
  - km-tui.checkbox-all-views
  - km-tui-checkbox-all-views
created_by: Bjørn Stabell
created_at: 2026-04-03T07:53:26Z
closed_at: 2026-04-03T07:59:36Z
close_reason: "Fixed 3 gaps: (1) popover title now shows task status icon, (2)
  DetailView root title now shows task status icon, (3) heading-tasks in
  DetailView now show checkbox (isHeading branch no longer swallows task
  marker). Files: tree-node-shared.ts, DetailView.tsx."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Sub-items with tasks missing checkbox/task-marker in popover and detail view @km/tui #bug #P1 @Bjørn Stabell

Sub-items with task status don't show checkboxes/task-markers in popover or detail view. Only the board view (TreeNode) has interactive checkboxes — popover and detail view still use static getStatusIcon or may not render task markers for sub-items at all.

## Expected

Any node with a task status (todo/wip/blocked/done/dropped) should show its task marker in ALL views: board, popover, detail view.

## Actual

Task markers missing for sub-items in popover and detail view.

## Root cause

CheckboxIcon was added to TreeNode.tsx only. DetailView.tsx (line 274) and NodeView.tsx (lines 260, 334, 574) still use static getStatusIcon. Popover content rendering may not traverse sub-items with task status.

## Fix

- Add CheckboxIcon (or at minimum static task markers) to DetailView and popover content for sub-items
- Ensure any node with item.task.status renders its status icon in all views

## Done when

- Sub-items with task status show checkbox/marker in popover
- Sub-items with task status show checkbox/marker in detail view
- All views consistently render task markers for any node with task status

