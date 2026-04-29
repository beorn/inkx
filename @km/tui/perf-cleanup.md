---
id: "@km/tui/perf-cleanup"
aliases:
  - km-tui.perf-cleanup
  - km-tui-perf-cleanup
created_at: 2026-02-08T12:40:58Z
closed_at: 2026-02-08T13:23:22Z
assignee: claude:a3625ec3
---

# [x] Remove old layout system @km/tui #task #P2 @claude:a3625ec3

Phase 1 cleanup: Remove dead fields from ColumnsLayout (subPath always [], isInOutlineMode always false). Remove handleHierarchicalNavigation (dead after viewnav). Remove unused imports. The full layout system removal (ColumnsLayout/colIndex/cardIndex→Path) is deferred to a separate bead — it touches 37+ files across all views, handlers, and keyboard helpers.